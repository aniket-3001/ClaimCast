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
    title: "Family / caregiver",
    who: "Log in as user",
    pitch:
      "Before the admission: what the policy will refuse, which choices change it, and the arithmetic behind every rupee.",
    tabs: ["Start — who you are, your policy, your schedule", "The path — every choice and what it costs you", "The working — the bill line by line, each deduction cited"],
  },
  {
    role: "admin",
    title: "ClaimCast admin",
    who: "Log in as admin",
    pitch:
      "Behind the screens: the reference data every figure comes from, and the record of what the system has learned from use.",
    tabs: ["Database — hospitals, procedures, policies, IRDAI lists, clauses", "What it has learned — corrections, settled bills, and the cost model retraining itself"],
  },
];

export function Login({ onPick }: { onPick: (role: Role) => void }) {
  return (
    <div className="login">
      <div className="login-brand">
        <div className="brand">ClaimCast</div>
        <div className="brand-sub">What the policy will not pay, before the admission</div>
      </div>

      <div className="login-sides">
        {SIDES.map((s) => (
          <button key={s.role} className="login-card" onClick={() => onPick(s.role)}>
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
        Prototype · synthetic data · no password. The two views are the two sides of ClaimCast, not two
        levels of access.
      </p>
    </div>
  );
}
