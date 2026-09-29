import {
  fmt,
  signed,
  hospitalOptions,
  implantOptions,
  roomOptions,
  type CaseInput,
  type Evaluated,
  type Option,
} from "@claimcast/engine";
import { t, tx } from "../i18n";

/**
 * The same admission, counted again under every choice still available.
 *
 * Ranked by what the family pays, not by what the bill comes to, because those
 * two orders are frequently different — a dearer hospital inside the network
 * can leave less to find on the day than a cheaper one outside it.
 */
export function Alternatives({ e, onPick }: { e: Evaluated; onPick: (next: CaseInput) => void }) {
  const rooms = roomOptions(e);
  const hospitals = hospitalOptions(e);
  const implants = e.procedure.implantOptions ? implantOptions(e) : [];

  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>{t("Every room class at {h}", { h: e.hospital.name })}</h2>
          <span className="aside">
            {t("Room limit {x}", {
              x: e.result.roomCapPerDay === null ? t("none") : t("{x} / day", { x: fmt(e.result.roomCapPerDay) }),
            })}
          </span>
        </div>
        <Table
          options={rooms}
          onPick={(o) => onPick(o.next)}
          emptyNote={t("This hospital has one room class.")}
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t("Every hospital in the set")}</h2>
          <span className="aside">{t("Same room class where they stock it, nearest by tariff where they do not")}</span>
        </div>
        <Table options={hospitals} onPick={(o) => onPick(o.next)} />
      </section>

      {implants.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{t("Every device on offer")}</h2>
            <span className="aside">
              {t("Implant sub-limit {x}", {
                x: e.policy.implantSubLimit === null ? t("none") : fmt(e.policy.implantSubLimit),
              })}
            </span>
          </div>
          <Table options={implants} onPick={(o) => onPick(o.next)} />
        </section>
      )}
    </>
  );
}

function Table({
  options,
  onPick,
  emptyNote,
}: {
  options: Option[];
  onPick: (o: Option) => void;
  emptyNote?: string;
}) {
  if (options.length <= 1 && emptyNote) return <div className="empty">{emptyNote}</div>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>{t("Option")}</th>
            <th className="num">{t("Bill")}</th>
            <th className="num">{t("You pay")}</th>
            <th className="num">{t("Against now")}</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr className="pick" key={o.key} onClick={() => onPick(o)}>
              <td>
                {tx(o.label)}
                {o.current && <span className="chip here" style={{ marginLeft: 8 }}>{t("current")}</span>}
                {!o.available && <span className="chip warn" style={{ marginLeft: 8 }}>{t("no cashless")}</span>}
                <div className="sub">{tx(o.detail)}</div>
              </td>
              <td className="num">{fmt(o.billTotal)}</td>
              <td className="num">{fmt(o.patientPays)}</td>
              <td className="num" style={{ color: o.delta < 0 ? "var(--paid)" : o.delta > 0 ? "var(--loss)" : undefined }}>
                {o.delta === 0 ? "—" : signed(o.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
