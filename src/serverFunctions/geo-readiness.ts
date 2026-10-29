import { createServerFn } from "@tanstack/react-start";
import { analyzeGeoReadiness } from "@/server/features/geo-readiness/services/geoReadiness";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { geoReadinessInputSchema } from "@/types/schemas/geo-readiness";

export const checkGeoReadiness = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(geoReadinessInputSchema)
  .handler(async ({ data }) => analyzeGeoReadiness(data.url));
