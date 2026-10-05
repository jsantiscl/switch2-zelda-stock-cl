const SERVICE = "switch2-zelda-stock-cl";

function githubHeaders(env) {
  return {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "switch2-zelda-cloudflare-scheduler",
  };
}

async function hasActiveMonitorRun(env) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const url =
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/runs?event=repository_dispatch&per_page=10`;

    const response = await fetch(url, {
      headers: githubHeaders(env),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`ACTIVE CHECK SKIPPED · GitHub ${response.status}`);
      return false;
    }

    const payload = await response.json();
    const activeStates = new Set(["queued", "in_progress", "pending", "waiting", "requested"]);
    const active = (payload.workflow_runs || []).find((run) =>
      activeStates.has(String(run.status || "").toLowerCase()),
    );

    if (active) {
      console.log(
        `DISPATCH SKIPPED · run #${active.run_number} sigue ${active.status} · no se crea otro tick`,
      );
      return true;
    }

    return false;
  } catch (err) {
    // Fail-open: si GitHub no permite comprobar el estado, intentamos
    // despachar igualmente para no silenciar el monitor.
    console.warn(
      `ACTIVE CHECK ERROR · se despachará igual · ${err?.message || String(err)}`,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchMonitor(env, scheduledTime, source = "cron") {
  if (!env.GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN secret");

  if (source === "cron" && await hasActiveMonitorRun(env)) {
    return { dispatched: false, reason: "active_run" };
  }

  const url =
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`;

  const response = await fetch(url, {
    method: "POST",
    headers: githubHeaders(env),
    body: JSON.stringify({
      event_type: "cloudflare_tick",
      client_payload: {
        scheduled_time: new Date(scheduledTime).toISOString(),
        source,
      },
    }),
  });

  if (response.status !== 204) {
    throw new Error(
      `GitHub repository_dispatch failed: ${response.status} ${await response.text()}`,
    );
  }

  console.log(
    `DISPATCH OK · ${new Date(scheduledTime).toISOString()} · GitHub monitor solicitado`,
  );
  return { dispatched: true, reason: null };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      dispatchMonitor(env, controller.scheduledTime, "cron").catch((err) => {
        console.error(
          JSON.stringify({
            event: "scheduler_dispatch",
            ok: false,
            scheduled_time: new Date(controller.scheduledTime).toISOString(),
            error: err?.stack || String(err),
          }),
        );
        throw err;
      }),
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: SERVICE,
        scheduler: "Cloudflare Cron",
        execution: "GitHub Actions via repository_dispatch",
        cron: "* * * * *",
        interval: "1 minute",
        github_token_configured: Boolean(env.GITHUB_TOKEN),
        github_repository: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`,
        notification_users: [env.GITHUB_OWNER, "Baaaaar1"],
        now: new Date().toISOString(),
      });
    }

    if (url.pathname === "/run") {
      const auth = request.headers.get("authorization") || "";
      if (!env.RUN_TOKEN || auth !== `Bearer ${env.RUN_TOKEN}`) {
        return new Response("Unauthorized", { status: 401 });
      }

      await dispatchMonitor(env, Date.now(), "manual");
      return Response.json({ ok: true, dispatched: true });
    }

    return new Response("Not found", { status: 404 });
  },
};
