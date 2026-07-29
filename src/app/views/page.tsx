import { ViewsPage } from "./views-page";

/**
 * Views page (`/views`).
 *
 * Thin server shell that delegates to the `ViewsPage` client component
 * (URL state, tabs, project picker, and grid/timeline/kanban panels).
 * The proxy enforces auth on `/views`, so an unauthenticated visitor
 * never reaches this component.
 */
export default function Page() {
  return <ViewsPage />;
}
