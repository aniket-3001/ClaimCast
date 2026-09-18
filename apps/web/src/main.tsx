/**
 * Boot.
 *
 * The reference data is fetched and installed before anything renders, because
 * the engine has nothing to price with until it is and every screen below here
 * assumes it is there.
 *
 * If that fetch fails, the app says so and stops. There is no bundled copy to
 * fall back to, deliberately: a figure on screen has to have come from the
 * database the screen says it came from, and an app that quietly substituted a
 * hand-written sample set would be lying about exactly the thing this project
 * is trying to be trusted on.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadReference } from "./api";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

function Unavailable({ detail }: { detail: string }) {
  return (
    <div className="boot-error">
      <h1>ClaimCast cannot reach its data</h1>
      <p>
        Every hospital tariff, policy structure and IRDAI clause this app works from lives in the
        ClaimCast database, and it could not be read. Nothing is shown rather than something
        estimated.
      </p>
      <p className="detail">{detail}</p>
      <p className="detail">
        In development the API runs with <code>npm run api</code>, and it needs Postgres up (
        <code>npm run db:up</code>) and seeded (<code>npm run db:seed</code>).
      </p>
    </div>
  );
}

loadReference().then(
  () =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  (e: unknown) => root.render(<Unavailable detail={e instanceof Error ? e.message : String(e)} />),
);
