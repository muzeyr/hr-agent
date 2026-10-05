import cds from "@sap/cds";

/**
 * Links from tool results into the Fiori apps.
 *
 * Each app declares which entity it shows, next to its other annotations:
 *
 *   annotate LeaveService.TeamLeaveRequests with @hr.app: '/team-leave-requests/webapp/index.html';
 *
 * and the services put `appUrl(<entity>, <key>)` into what they return, the
 * way they put a `pdfUrl`. The agents then make a request number a link that
 * opens that very record on the app's object page. The URL is the app's
 * route `<EntitySet>(<key>)`, the pattern every manifest here uses.
 *
 * Without the annotation — an app not deployed, the app folder not in the
 * model — the link is null, and the agents leave the number as plain text.
 */
export function appUrl(entity: string, key: string | null | undefined): string | null {
  const def = cds.model?.definitions[entity] as { "@hr.app"?: string } | undefined;
  const app = def?.["@hr.app"];
  if (!app || !key) return null;
  return `${app}#/${entity.split(".").pop()}(${key})`;
}
