/**
 * The front door: which side of ClaimCast to look at.
 *
 * Two roles and no password, on purpose. This is a prototype shown to judges,
 * and what it has to show is the two halves of the product -- what a family
 * sees before an admission, and what ClaimCast keeps and learns from behind
 * it. The choice is a view, not an access control.
 */

export type Role = "user" | "admin";

const SIDES: { role: Role; title: string; pitch: string; go: string }[] = [
  {
    role: "user",
    title: "Patient / Caregiver",
    pitch:
      "Find out, before you are admitted, how much of the hospital bill your insurance will not pay — and which choices would lower it.",
    go: "Continue as user",
  },
  {
    role: "admin",
    title: "ClaimCast team",
    pitch:
      "See every saved session, the hospital and insurance data behind each figure, and how ClaimCast learns from every user it helps.",
    go: "Continue as admin",
  },
];

export function Login({ onPick }: { onPick: (role: Role) => void }) {
  return (
    <div className="login">
      <div className="login-brand">
        <h1 className="brand login-title">ClaimCast</h1>
        <p className="login-sub">Know what your hospital bill will cost you &mdash; before you are admitted.</p>
      </div>

      <div className="login-sides">
        {SIDES.map((s) => (
          <button key={s.role} className="login-card" onClick={() => onPick(s.role)}>
            <span className="login-role">{s.title}</span>
            <span className="login-pitch">{s.pitch}</span>
            <span className="login-go">{s.go} →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
