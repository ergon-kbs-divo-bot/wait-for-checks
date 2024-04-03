import * as core from '@actions/core'
import * as github from '@actions/github'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const octokit = github.getOctokit(core.getInput('token'))
    const startTime = new Date()

    // 1. Get all workflow runs (not jobs)
    const runs = new Set<number>()
    let page = 0
    let fetched = 0
    const pageSize = 100

    do {
      const { data: response } = await octokit.rest.checks.listForRef({
        ...github.context.repo,
        filter: 'latest',
        per_page: pageSize,
        page,
        ref: github.context.ref
      })
      fetched = response.check_runs.length

      for (const it of response.check_runs) {
        const runId = (it.details_url?.match(/runs\/(\d+)\/job/) ?? [
          undefined
        ])[1]
        if (runId) {
          runs.add(Number(runId))
        }
      }
      page += 1
    } while (fetched >= pageSize)

    let workflowRun = undefined
    for (const r of runs) {
      const { data: candidate } = await octokit.rest.actions.getWorkflowRun({
        ...github.context.repo,
        run_id: r
      })
      if (candidate.name === core.getInput('workflow')) {
        workflowRun = candidate
        break
      }
    }
    if (workflowRun !== undefined) {
      while (workflowRun.conclusion !== 'success') {
        if ((new Date().getTime() - startTime.getTime()) / 1000 / 60 > 10) {
          // 10 min at most
          throw new Error('timed out waiting for jobs to finish')
        }

        await wait(100)
        workflowRun = (
          await octokit.rest.actions.getWorkflowRun({
            ...github.context.repo,
            run_id: workflowRun.id
          })
        ).data
      }
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }

  async function wait(millis: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => resolve(), millis)
    })
  }
}
