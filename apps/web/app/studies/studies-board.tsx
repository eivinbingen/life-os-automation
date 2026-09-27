"use client";

import { useMemo } from "react";

import type { ScheduleItem, StudiesCourse, StudiesOverview } from "./studies-actions";

const shortDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatDue(due: string | null): string | null {
  if (!due) return null;
  const datePart = due.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  // Notion's date-time value contains the wall-clock time entered for the item.
  return due.includes("T")
    ? `${shortDateFormatter.format(new Date(`${datePart}T12:00:00Z`))} · ${due.slice(11, 16)}`
    : shortDateFormatter.format(new Date(`${datePart}T12:00:00Z`));
}

export function StudiesBoard({ overview }: { overview: StudiesOverview }) {
  const notionIssue = overview.statuses.find((status) => status.name === "Notion" && !status.ok);

  const upcoming = useMemo(
    () =>
      [...overview.upcoming].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "")),
    [overview.upcoming],
  );

  const courseCount = overview.courses.length;
  const assessmentCount = upcoming.filter((item) => item.kind === "assessment").length;
  const openWorkCount = upcoming.filter((item) => item.kind !== "assessment").length;

  return (
    <div className="dashboard-content">
      <section className="intro" aria-labelledby="studies-title">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> STUDIES</p>
          <h1 id="studies-title" className="week-title">
            Active courses and upcoming work<span className="title-period">.</span>
          </h1>
          <p className="intro-copy">
            Your courses from Notion with the next known deadline or study task.
          </p>
        </div>
      </section>

      <div className="overview-strip" aria-label="Studies at a glance">
        <div className="overview-item">
          <strong>{notionIssue ? "Unavailable" : courseCount}</strong>
          <span>Active courses</span>
        </div>
        <div className="overview-item">
          <strong>{notionIssue ? "Unavailable" : openWorkCount}</strong>
          <span>Open work</span>
        </div>
        <div className="overview-item">
          <strong>{notionIssue ? "Unavailable" : assessmentCount}</strong>
          <span>Assessments</span>
        </div>
      </div>

      {notionIssue ? (
        <div className="integration-alert" role="status">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>
            Notion is unavailable: {notionIssue.error ?? "unknown error"}{" "}
            {overview.warnings.length > 0 ? overview.warnings.join(" ") : "Some information may be missing."}
          </span>
        </div>
      ) : null}

      <section className="panel" aria-labelledby="studies-courses-heading">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">NOTION</span>
            <h2 id="studies-courses-heading">Active courses</h2>
          </div>
          <span className="count-badge">
            {courseCount} {courseCount === 1 ? "course" : "courses"}
          </span>
        </div>
        {courseCount === 0 ? (
          <p className="review-empty-note">No active courses in Notion.</p>
        ) : (
          <ul className="finance-accounts">
            {overview.courses.map((course) => (
              <CourseRow key={course.id} course={course} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="studies-upcoming-heading">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">NEXT SIX WEEKS</span>
            <h2 id="studies-upcoming-heading">Upcoming work</h2>
          </div>
        </div>
        {upcoming.length === 0 ? (
          <p className="review-empty-note">No upcoming academic work in the next six weeks.</p>
        ) : (
          <ul className="finance-accounts">
            {upcoming.map((item) => (
              <UpcomingRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CourseRow({ course }: { course: StudiesCourse }) {
  const due = course.next_item ? formatDue(course.next_item.due) : null;
  const extra = Math.max(course.upcoming.length - 1, 0);

  return (
    <li className="finance-account">
      <span className="finance-account-name">{course.name}</span>
      {course.next_item ? (
        <span className="finance-account-balance">
          {course.next_item.name}
          {due ? ` · ${due}` : ""}
        </span>
        ) : null}
      <span className="finance-account-type">
        {course.next_item
          ? `Next${extra > 0 ? ` · +${extra} more` : ""}`
          : "No upcoming work"}
      </span>
    </li>
  );
}

function UpcomingRow({ item }: { item: ScheduleItem }) {
  const due = formatDue(item.due);

  return (
    <li className="finance-account">
      <span className="finance-account-name">{item.name}</span>
      {item.course_name ? (
        <span className="finance-account-balance">{item.course_name}</span>
      ) : null}
      <span className="finance-account-type">{due ? `Due ${due}` : "No date"}</span>
    </li>
  );
}
