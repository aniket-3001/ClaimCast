/**
 * The front door: which side of ClaimCast to look at.
 *
 * Two roles and no password, on purpose. This is a prototype shown to judges,
 * and what it has to show is the two halves of the product -- what a family
 * sees before an admission, and what ClaimCast keeps and learns from behind
 * it. The choice is a view, not an access control; the account sign-in inside
 * the user view is unchanged and still what owns saved cases and uploads.
 */

export type Role = "user" | "admin";

const SIDES: { role: Role; title: string; who: string; pitch: string; tabs: string[] }[] = [
  {
    role: "user",
    title: "I’m a patient or family member",
    who: "Continue as a family",
    pitch:
      "Find out, before you are admitted, how much of the hospital bill your insurance will not pay — and which choices would lower it.",
    tabs: ["Start — tell us about you and your insurance", "The path — each choice and what it costs you", "The working — your bill, line by line"],
  },
  {
    role: "admin",
    title: "I’m on the ClaimCast team",
    who: "Continue as admin",
    pitch:
      "See every saved family session, the hospital and insurance data behind each figure, and how ClaimCast learns from every family it helps.",
    tabs: ["Database — saved sessions, hospitals, treatments, plans", "What it has learned — memory and self-learning"],
  },
];

export function Login({ onPick }: { onPick: (role: Role) => void }) {
  return (
    <div className="login">
      <div className="login-brand">
        <div className="brand">ClaimCast</div>
        <h1 className="login-hero">Know what your hospital bill will cost you &mdash; before you are admitted.</h1>
        <p className="login-lede">
          Health insurance in India often refuses part of a claim. ClaimCast shows you how much, why,
          and what you can still change.
        </p>
      </div>

      <div className="login-sides">
        {SIDES.map((s) => (
          <button key={s.role} className="login-card" onClick={() => onPick(s.role)}>
            <span className={`login-badge ${s.role}`}>{s.role === "user" ? "For families" : "For the team"}</span>
            <span className="login-role">{s.title}</span>
            <span className="login-pitch">{s.pitch}</span>
            <ul className="login-tabs">
              {s.tabs.map((t, i) => (
                <li key={t}>
                  <span className="tab-n">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ul>
            <span className="login-go">{s.who} →</span>
          </button>
        ))}
      </div>

      <p className="login-note">
        Demo version · all hospitals, insurers and patients are made up · no password needed
      </p>
    </div>
  );
}
