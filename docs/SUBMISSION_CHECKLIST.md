# Submission Checklist

Use this checklist before linking the project to the Microsoft Agents League Reasoning Agents challenge.

## Required Entry Items

- [ ] Registered for Agents League and activated the hackathon platform profile.
- [ ] Project linked to **Battle #2 - Reasoning Agents with Microsoft Foundry**.
- [ ] Public GitHub repository is available.
- [ ] Demo video is uploaded to YouTube or Vimeo and is 5 minutes max.
- [ ] Demo video avoids third-party trademarks, copyrighted material, confidential data, and real customer/employee data.
- [ ] Project description explains features, functionality, problem solved, and technologies used.
- [ ] Architecture diagram is included: `docs/ARCHITECTURE.md`.
- [ ] Team member information and Microsoft Learn usernames are ready, if applicable.

## Reasoning Agents Requirements

- [x] Multi-agent system aligned to the challenge scenario.
- [x] Microsoft Foundry / Foundry IQ-style grounding documented.
- [x] Real retrievable grounding adapter documented through Azure AI Search configuration.
- [x] Multi-step reasoning demonstrated through planner, generator, verifier, repair, reviewer, and explainer roles.
- [x] External tool integration through Azure Bicep CLI compiler validation.
- [x] Synthetic data and documents only.
- [x] Agent responsibilities, orchestration flow, tools, citations, and data sources documented.
- [x] Evaluation plan included in `evals/reasoning-agent-evals.json`.
- [x] Automated evaluation command included: `npm run eval`.
- [x] Container deployment path included through `Dockerfile`.

## Safety and Compliance

- [x] `CODE_OF_CONDUCT.md` included.
- [x] `.env`, generated deployment files, and build outputs are gitignored.
- [x] Repository states that data is synthetic and demo-only.
- [x] Generated templates avoid hard-coded real secrets.
- [x] No automatic deployment is performed by the demo flow.
- [x] Run a final secret scan before pushing.
- [ ] Review commit history before making the repository public.
- [ ] Confirm all project assets are original or permitted.

## Demo Video Outline

1. State the problem: beginner engineers struggle to safely understand infrastructure-as-code.
2. Show the architecture diagram and multi-agent roles.
3. Run the default SaaS prompt with App Service, Storage, Key Vault, and Application Insights.
4. Keep `Inject demo compiler error` enabled to show verifier and repair reasoning.
5. Show **Agent reasoning trace**.
6. Show quality review and score.
7. Hover over generated Bicep blocks to show block-level explanations.
8. Explain synthetic Foundry IQ standards and safety controls.
9. End with the evaluation plan and production deployment story.

## Recommended Project Description

CloudSchema is a multi-agent infrastructure reasoning tutor for beginner engineers. It converts a plain-language application idea into validated Azure Bicep using a planner-executor-verifier-repair-critic-explainer workflow. The system is grounded in a synthetic Foundry IQ-style standards knowledge source, validates output with the Azure Bicep CLI, repairs compiler failures, reviews quality risks, and explains every generated code block in beginner-friendly language.
