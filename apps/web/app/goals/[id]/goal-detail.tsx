"use client";

import { useMemo } from "react";

import { formatStripDate } from "../../date-utils";
import type { GoalDetail } from "../../goals-actions";
import { TaskProjectLink } from "../../task-project-link";

export function GoalDetailBoard({ goal }: { goal: GoalDetail }) {
  const failed = goal.statuses.filter((status) => !status.ok);
  const sorted = useMemo(
    () =>
      [...goal.projects].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [goal.projects],
  );

  return (
    <div className="dashboard-content">
      <section className="intro" aria-labelledby="goal-title">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> GOAL</p>
          <h1 id="goal-title" className="week-title">
            {goal.name ?? "Untitled goal"}<span className="title-period">.</span>
          </h1>
          <p className="intro-copy">
            The goal&apos;s intended outcome and the work connected to it, from Notion.
          </p>
        </div>
      </section>

      {failed.length > 0 && (
        <div className="integration-alert" role="status">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>
            {failed.map((status) => status.name).join(" and ")}{" "}
            {failed.length === 1 ? "is" : "are"} unavailable. Some information may
            be missing.
          </span>
        </div>
      )}
      {goal.warnings.length > 0 && (
        <div className="integration-alert" role="status">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>{goal.warnings.join(" ")}</span>
        </div>
      )}

      <div className="overview-strip cols-4" aria-label="Goal at a glance">
        <div className="overview-item">
          <span>Status</span>
          <strong>
            {goal.status_available
              ? goal.status ?? "—"
              : "Unavailable"}
          </strong>
        </div>
        <div className="overview-item">
          <span>Area</span>
          <strong>
            {goal.area_name ?? (goal.area_id ? "Unavailable" : "—")}
          </strong>
        </div>
        <div className="overview-item">
          <span>Target date</span>
          <strong>
            {goal.target_date ? formatStripDate(goal.target_date) : "—"}
          </strong>
        </div>
        <div className="overview-item">
          <span>Projects</span>
          <strong>{goal.projects.length}</strong>
        </div>
      </div>

      <section className="panel" aria-labelledby="goal-projects-heading">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">NOTION</span>
            <h2 id="goal-projects-heading">Related projects</h2>
          </div>
          <span className="count-badge">{goal.projects.length}</span>
        </div>
        {goal.projects.length === 0 ? (
          <p className="review-empty-note">No projects linked to this goal yet.</p>
        ) : (
          <ul className="finance-accounts">
            {sorted.map((project) => (
              <li className="finance-account" key={project.id}>
                <span className="finance-account-name">
                  <TaskProjectLink
                    projectId={project.id}
                    projectName={project.name ?? "Untitled project"}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="dashboard-footer">
        <span>Life OS <span className="footer-separator">/</span> Goal</span>
        <span className="footer-status"><span className="footer-status-dot" />Read-only workspace</span>
      </footer>
    </div>
  );
}
