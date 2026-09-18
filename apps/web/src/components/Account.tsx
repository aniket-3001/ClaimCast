/**
 * The account control, which is deliberately almost invisible.
 *
 * Nobody opens a claim estimator wanting to make an account, and being asked to
 * before you can do anything is how these tools lose people on the first screen.
 * So the session is already running by the time this renders, the work is
 * already owned, and this offers one thing: a way to reach that work from
 * another browser. Until there is work to lose it says nothing at all.
 *
 * The wording avoids "sign up" and "log in" for the same reason. Those promise a
 * new account and an existing one respectively, and the server does not make the
 * caller say which — it can tell, and saying so out loud would confirm to anyone
 * who asks whether a given email has an account on a health claims site.
 */

import { useEffect, useState } from "react";
import type { Session } from "@claimcast/contracts";
import { claimAccount, signOut, whoami } from "../api";

type Form = { open: boolean; email: string; password: string; busy: boolean; error: string };

const BLANK: Form = { open: false, email: "", password: "", busy: false, error: "" };

export default function Account() {
  const [me, setMe] = useState<Session | null>(null);
  const [form, setForm] = useState<Form>(BLANK);

  // Runs once, and it is also the request that creates the session. Doing it at
  // boot rather than at the first upload means a policy schedule never arrives
  // at a server that has nowhere to put it.
  useEffect(() => {
    void whoami().then(setMe);
  }, []);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setForm((f) => ({ ...f, busy: true, error: "" }));
    const out = await claimAccount(form.email, form.password);
    if (!out.ok) {
      setForm((f) => ({ ...f, busy: false, error: out.reason }));
      return;
    }
    setMe(out.session);
    setForm(BLANK);
  }

  async function out() {
    await signOut();
    setMe(await whoami());
  }

  // The API is not answering. The reference load has already said so in the
  // place where it matters; a second notice in the corner is noise.
  if (!me) return null;

  if (!me.anonymous) {
    return (
      <div className="acct">
        <span className="acct-who">{me.email}</span>
        <button type="button" className="acct-link" onClick={() => void out()}>
          Sign out
        </button>
      </div>
    );
  }

  if (form.open) {
    return (
      <form className="acct acct-form" onSubmit={(ev) => void submit(ev)}>
        <input
          type="email"
          required
          placeholder="Email"
          autoComplete="username"
          value={form.email}
          onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
        />
        <input
          type="password"
          required
          minLength={10}
          placeholder="Password, 10+ characters"
          autoComplete="current-password"
          value={form.password}
          onChange={(ev) => setForm((f) => ({ ...f, password: ev.target.value }))}
        />
        <button type="submit" className="acct-go" disabled={form.busy}>
          {form.busy ? "…" : "Keep"}
        </button>
        <button type="button" className="acct-link" onClick={() => setForm(BLANK)}>
          Cancel
        </button>
        {form.error && <div className="acct-err">{form.error}</div>}
      </form>
    );
  }

  return (
    <div className="acct">
      <span className="acct-who">
        {me.cases === 0
          ? "This browser only"
          : me.cases === 1
            ? "1 case on this browser"
            : `${me.cases} cases on this browser`}
      </span>
      <button
        type="button"
        className="acct-link"
        onClick={() => setForm({ ...BLANK, open: true })}
      >
        Keep them
      </button>
    </div>
  );
}
