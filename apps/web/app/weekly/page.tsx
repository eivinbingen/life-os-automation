import { redirect } from "next/navigation";

// The read-only V1 weekly overview was replaced by the guided Weekly
// Review; the route stays so existing links land on the review. Query
// parameters are dropped: the review always opens on the default week.
export default function WeeklyPage() {
  redirect("/review/weekly");
}
