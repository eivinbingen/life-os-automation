"use server";

export async function updateTaskDone(taskId: string, done: boolean) {
  const apiUrl = process.env.LIFE_OS_API_URL;

  if (!apiUrl) {
    throw new Error("LIFE_OS_API_URL is not configured");
  }

  const response = await fetch(
    `${apiUrl}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ done }),
    }
  );

  if (!response.ok) {
    throw new Error("Could not update task");
  }

  return response.json();
}
