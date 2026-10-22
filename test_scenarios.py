import json, asyncio
from backend.orchestrator import RemediationOrchestrator

async def test_all_scenarios():
    orch = RemediationOrchestrator()
    for scenario_id in ['pydantic-v2-billing-outage', 'sqlalchemy-async-deadlock', 'transformers-padding-crash']:
        print(f'\n=== Testing: {scenario_id} ===')
        events = []
        async for event in orch.run_workflow(scenario_id):
            events.append(event)
            if 'WORKFLOW_COMPLETED' in event:
                data_line = event.split('data: ', 1)[1].strip()
                result = json.loads(data_line)
                status = result["status"]
                commit = result["commit_message"]
                tp = result["test_results"]["tests_passed"]
                tr = result["test_results"]["tests_run"]
                dl = len(result["unified_diff"].splitlines())
                models = result["tokens_and_cost"]["models_utilized"]
                print(f'  Status: {status}')
                print(f'  Commit: {commit}')
                print(f'  Tests: {tp}/{tr} passed')
                print(f'  Diff Lines: {dl}')
                print(f'  Models Used: {models}')
        print(f'  Total Events: {len(events)}')

asyncio.run(test_all_scenarios())
