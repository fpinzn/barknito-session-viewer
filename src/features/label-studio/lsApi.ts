import type { LSTask } from './taskGenerator'

interface LSProject {
  id: number
  title: string
}

export async function pushTask(
  lsUrl: string,
  apiKey: string,
  projectId: number,
  task: LSTask,
): Promise<{ id: number }> {
  const resp = await fetch(`${lsUrl}/api/tasks/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({ ...task, project: projectId }),
  })

  if (!resp.ok) {
    throw new Error(`Label Studio API error ${resp.status}: ${await resp.text()}`)
  }

  return resp.json()
}

export async function listProjects(
  lsUrl: string,
  apiKey: string,
): Promise<LSProject[]> {
  const resp = await fetch(`${lsUrl}/api/projects/`, {
    headers: {
      Authorization: `Token ${apiKey}`,
    },
  })

  if (!resp.ok) {
    throw new Error(`Label Studio API error ${resp.status}: ${await resp.text()}`)
  }

  const data = await resp.json()
  // LS API returns { results: [...] } or directly an array
  return Array.isArray(data) ? data : data.results ?? []
}
