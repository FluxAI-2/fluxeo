import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GeoReadinessPage } from "@/client/features/geo-readiness/GeoReadinessPage";
import { geoReadinessSearchSchema } from "@/types/schemas/geo-readiness";

// No ProjectWebsiteGate: any URL can be checked, and the check needs neither
// DataForSEO nor an LLM key, so it works on a fresh self-hosted install.
export const Route = createFileRoute("/_app/p/$projectId/geo-readiness")({
  validateSearch: geoReadinessSearchSchema,
  remountDeps: ({ params }) => params.projectId,
  component: GeoReadinessRoute,
});

function GeoReadinessRoute() {
  const { projectId } = Route.useParams();
  const { url } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-8 md:py-8 md:pb-10">
      <div className="mx-auto max-w-6xl">
        <GeoReadinessPage
          projectId={projectId}
          url={url}
          onUrlChange={(next) => {
            void navigate({ search: { url: next }, replace: true });
          }}
        />
      </div>
    </div>
  );
}
