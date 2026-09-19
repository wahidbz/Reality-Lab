import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { runDemo, DEMO_SCENARIOS } from '../simulation/scenarios';
import { formatNumber, formatPercent } from '../lib/format';

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                       */
/* ------------------------------------------------------------------ */

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="card card-hover p-5">
      <span className="mono grid h-9 w-9 place-items-center rounded-full border border-electric-500/40 bg-electric-500/10 text-sm font-bold text-electric-300">
        {n}
      </span>
      <h3 className="mt-3 text-base font-bold text-white">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">{body}</p>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function Home() {
  // The demo runs the REAL engine in the browser — not stored JSON.
  const demo = useMemo(() => runDemo(DEMO_SCENARIOS[0].slug), []);
  const preview = demo?.rounds.slice(0, 6) ?? [];

  return (
    <div>
      {/* ------------------------------ HERO ------------------------------ */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse 70% 50% at 50% 0%, #000 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 50% at 50% 0%, #000 30%, transparent 75%)',
          }}
        />
        <div className="container-xl relative py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge border-electric-500/30 bg-electric-500/10 text-electric-300">
              Business simulation engine · MVP 0.1
            </span>

            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-6xl">
              <span className="text-gradient">REALITY LAB</span>
            </h1>

            <p className="mt-4 text-lg font-medium text-slate-300 sm:text-xl">
              Test your ideas before reality does.
            </p>

            <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
              Turn an idea into a simulated world. Test decisions, observe behavior, explore scenarios, and
              understand what could happen before you act in the real world.
            </p>

            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link to="/simulate/new" className="btn-primary !px-6 !py-3 text-base">
                Run a Simulation
              </Link>
              <Link to="/explore" className="btn-secondary !px-6 !py-3 text-base">
                Explore Simulations
              </Link>
            </div>

            <p className="mt-6 text-xs text-slate-500">
              No setup required · Runs in your browser · Deterministic &amp; reproducible
            </p>
          </div>

          {/* Hero stat strip — values come from the live demo run. */}
          {demo && (
            <dl className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: 'Agents simulated', v: formatNumber(demo.customers.length) },
                { k: 'Rounds run', v: `${demo.rounds.length} months` },
                { k: 'Events generated', v: formatNumber(demo.events.length) },
                { k: 'Simulation score', v: `${demo.score.score} / 100` },
              ].map((s) => (
                <div key={s.k} className="card px-4 py-4 text-center">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.k}</dt>
                  <dd className="mono mt-1 text-xl font-bold text-white">{s.v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* ------------------------- HOW IT WORKS --------------------------- */}
      <section className="container-xl py-14 sm:py-20" aria-labelledby="how">
        <h2 id="how" className="section-title">
          How it works
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Four steps from a sentence to a simulated market.
        </p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Step n={1} title="Describe your idea" body="Write your business idea in plain language. Reality Lab extracts the scenario variables." />
          <Step n={2} title="Build your scenario" body="Set the location, target customers, budget, price and duration." />
          <Step n={3} title="Run the simulation" body="Customer and competitor agents make decisions, month after month, against explicit rules." />
          <Step n={4} title="Explore the results" body="Read the timeline, the metrics, the score breakdown and the key findings — then test a What-If." />
        </ol>
      </section>

      {/* ------------------------- DEMO SIMULATION ------------------------ */}
      <section className="container-xl py-10 sm:py-14" aria-labelledby="demo">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="demo" className="section-title">
              Example simulation
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              This dashboard is produced by the same engine that runs your simulations, executed live in your
              browser.
            </p>
          </div>
          <span className="badge border-amber-500/30 bg-amber-500/10 text-amber-200">DEMO SIMULATION</span>
        </div>

        {demo ? (
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {/* Left: summary */}
            <div className="card p-5 lg:col-span-1">
              <h3 className="text-base font-bold text-white">{DEMO_SCENARIOS[0].name}</h3>
              <p className="mt-1 text-sm text-slate-400">{DEMO_SCENARIOS[0].description}</p>

              <dl className="mt-5 space-y-2.5">
                {[
                  ['Simulated customers', formatNumber(demo.customers.length)],
                  ['Competitors', formatNumber(demo.competitors.length)],
                  ['Simulated months', `${demo.rounds.length}`],
                  ['Average retention', formatPercent(demo.totals.avgRetention)],
                  ['Final market share', formatPercent(demo.totals.finalMarketShare, 1)],
                  ['Final cash', formatNumber(demo.totals.finalCash)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/[0.08] pb-2">
                    <dt className="text-xs text-slate-400">{k}</dt>
                    <dd className="mono text-sm font-semibold text-white">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 rounded-xl border border-electric-500/25 bg-electric-500/[0.08] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-electric-300">
                  Simulation score
                </p>
                <p className="mono mt-1 text-3xl font-extrabold text-white">{demo.score.score} / 100</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  This score summarizes the behavior of this simulation scenario. It is not a prediction of
                  real-world results.
                </p>
              </div>

              <Link to={`/simulation/demo/${DEMO_SCENARIOS[0].slug}`} className="btn-primary mt-5 w-full">
                View full demo simulation
              </Link>
            </div>

            {/* Middle: timeline */}
            <div className="card p-5 lg:col-span-1">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Timeline — first 6 months
              </h3>
              <ol className="mt-4 space-y-3 border-l border-white/10 pl-5">
                {demo.rounds.slice(0, 6).map((r) => (
                  <li key={r.round} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border border-electric-500/60 bg-ink-900"
                    />
                    <p className="mono text-xs font-semibold text-electric-300">Month {r.round}</p>
                    <p className="text-sm text-slate-300">
                      {r.activity.purchases} purchases · {formatPercent(r.metrics.awareness)} aware ·{' '}
                      {formatPercent(r.metrics.avgSatisfaction)} satisfaction
                    </p>
                    {r.events.length > 0 && (
                      <p className="mt-0.5 text-xs text-slate-400">{r.events[0].description}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {/* Right: monthly table + events */}
            <div className="card p-5 lg:col-span-1">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Early months in numbers
              </h3>
              <div className="mt-4 overflow-x-auto no-scrollbar">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Simulated monthly metrics for the demo scenario</caption>
                  <thead>
                    <tr className="text-slate-500">
                      <th scope="col" className="pb-2 font-medium">Month</th>
                      <th scope="col" className="pb-2 text-right font-medium">Buyers</th>
                      <th scope="col" className="pb-2 text-right font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="mono">
                    {preview.map((r) => (
                      <tr key={r.round} className="border-t border-white/[0.08]">
                        <td className="py-1.5 text-slate-300">M{r.round}</td>
                        <td className="py-1.5 text-right text-slate-200">{r.metrics.customers}</td>
                        <td
                          className={`py-1.5 text-right ${r.metrics.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
                        >
                          {formatNumber(r.metrics.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-slate-400">
                Notable events
              </h3>
              <ul className="mt-3 space-y-2">
                {demo.events.slice(0, 5).map((e) => (
                  <li key={e.id} className="text-xs">
                    <span className="mono font-semibold text-electric-300">M{e.month}</span>{' '}
                    <span className="text-slate-300">{e.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-400">The demo simulation could not be generated.</p>
        )}
      </section>

      {/* ---------------------------- WHY -------------------------------- */}
      <section className="container-xl py-14 sm:py-20" aria-labelledby="why">
        <h2 id="why" className="section-title">
          Why Reality Lab
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Traditional research</h3>
            <p className="mt-2 text-lg font-bold text-white">Ask people.</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Surveys and interviews tell you what people say — rarely how a market actually behaves once
              prices, competitors and time enter the picture.
            </p>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">AI</h3>
            <p className="mt-2 text-lg font-bold text-white">Analyze possibilities.</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Language models summarize and explain, but a summary is not a mechanism. Nothing in a paragraph
              tells you what happens in month 7.
            </p>
          </div>
          <div className="card border-electric-500/30 bg-electric-500/[0.07] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-electric-300">Reality Lab</h3>
            <p className="mt-2 text-lg font-bold text-white">Simulate scenarios.</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Agents with explicit attributes decide every round against explicit rules, and the metrics that
              come out are calculated from those decisions — not asserted.
            </p>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-slate-400">
          Reality Lab does not predict the future. It helps you explore:{' '}
          <em className="text-slate-300">
            if these assumptions and behaviors exist, what could happen?
          </em>{' '}
          The product philosophy is simple —{' '}
          <span className="font-semibold text-slate-200">
            IDEA → SIMULATION → EXPERIMENT → INSIGHT → DECISION
          </span>
          .
        </p>
      </section>

      {/* ---------------------------- CTA -------------------------------- */}
      <section className="container-xl pb-16">
        <div className="card relative overflow-hidden p-8 text-center sm:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-electric-500/15 via-transparent to-cyan-400/10"
          />
          <div className="relative">
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              What will you test first?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
              Describe a business idea in one sentence and watch a simulated market respond to it.
            </p>
            <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
              <Link to="/simulate/new" className="btn-primary !px-6 !py-3 text-base">
                Run a Simulation
              </Link>
              <Link to="/explore" className="btn-secondary !px-6 !py-3 text-base">
                Explore Simulations
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
