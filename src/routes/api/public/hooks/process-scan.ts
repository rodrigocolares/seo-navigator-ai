// Public worker endpoint used by pg_cron and by the app itself to kick
// scan processing. Protected by the WORKER_SECRET header.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/process-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WORKER_SECRET;
        const provided = request.headers.get("x-worker-secret");
        if (!secret || !provided || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { processQueueBatch } = await import("@/lib/scan-worker.server");
        try {
          const workerId = `w-${Math.random().toString(36).slice(2, 8)}`;
          const result = await processQueueBatch(5, workerId);
          return Response.json(result);
        } catch (err) {
          console.error("[process-scan] failure", err);
          return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : "worker error" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST with x-worker-secret to process jobs" }),
    },
  },
});
