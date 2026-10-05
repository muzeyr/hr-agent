/**
 * The persistence @cap-js/agents needs: A2A tasks, LangGraph checkpoints, push
 * notification configs and their attachments (namespace `cap.agent`).
 *
 * The plugin brings these entities but does not add them to the model —
 * `cds build --for hana` only emits tables for what the project's own model
 * reaches, so without this file the agent deploys against a schema that has
 * nowhere to put a task and fails on the first request.
 *
 * The path is the plugin's `srv/entities.cds`, not the bare package name: the
 * package has an `exports` map without a `"."` entry and no root `index.cds`,
 * so `using from '@cap-js/agents'` fails the build with
 * `Can't find package module ‘@cap-js/agents’`.
 */
using from '@cap-js/agents/srv/entities.cds';

/** The HR domain model: employees, leave requests, public holidays. */
using from './schema';
