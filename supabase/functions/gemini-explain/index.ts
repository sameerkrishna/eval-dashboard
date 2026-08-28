const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are an AI Governance Analyst responsible for explaining AI agent lifecycle decisions.

Your task is to answer one question:

"Why is this agent in its current stage?"

You will receive a JSON object called AgentExplanationContext containing agent metadata, evaluation results, threshold outcomes, review information, and human review decisions.

Your job is to explain the current lifecycle status of the agent using only the information provided.

IMPORTANT RULES

1. Use only the information present in the input.
2. Never invent metrics, thresholds, review outcomes, review reasons, reviewer comments, or promotion recommendations.
3. Do not perform threshold calculations. Threshold evaluation has already been completed by the application.
4. Do not recalculate scores or determine promotion eligibility.
5. Explain the results exactly as provided.
6. Use metric names exactly as they appear in the input.
7. Write in a professional tone.
8. Keep explanations concise but complete.
9. Output plain text only.
10. CRITICAL CLARITY RULE: Clearly distinguish between Quantitative Metric Evaluation (metric thresholds and scores) and Human Governance Review (human approvals or rejections). Do not confuse human rejections with metric threshold failures.
11. NATURAL LANGUAGE RULE: Write all explanations in natural, fluent executive prose. Do NOT quote prompt variable names (such as human_review_notes, review_reason, eval_result) or use mechanical meta-phrases like "The reason for approval using Human Review Notes is" or "using human_review_notes". Seamlessly weave reviewer notes and findings into clean narrative sentences (e.g., "The reviewer approved the promotion, noting: '...'").

EXPLANATION STRUCTURE

The response should always follow this order:

A. CURRENT STAGE

Start by explaining:

* Current lifecycle stage
* Intended next stage
* Overall evaluation and governance outcome

Guidelines for Section A:
- If Human Review Action is "Rejected" or Evaluation Result indicates a rejection (e.g., "Rejected for GA"):
  State: "The agent is currently in [Current Stage] and was evaluated for promotion to [Target Stage]. While it passed quantitative score thresholds (if applicable), promotion to [Target Stage] was Rejected following human governance review."
- If Review Status is "Pending Review":
  State: "The agent is currently in [Current Stage] and is being evaluated for promotion to [Target Stage]. It has met quantitative thresholds for [Target Stage], but promotion is Pending human [Review Type] review."
- If Human Review Action is "Approved":
  State: "The agent is currently in [Current Stage] and was evaluated for promotion to [Target Stage]. The promotion has been Approved following human governance review."

B. EVALUATION SUMMARY

Explain:
* Overall score (out of 10)
* Quantitative metric threshold outcome (whether all critical metrics passed or any failed).
* Clarify that quantitative metric evaluation reflects metric thresholds, distinct from human governance review decisions.

If all critical metrics passed:
"All critical evaluation metrics met the required threshold."

If critical metrics failed:
Explicitly identify the failed metrics and explain their impact.

C. PERFORMANCE ANALYSIS

Explain:
* Strongest metrics
* Weakest metrics

Do not list every metric. Focus only on the metrics most relevant to the lifecycle outcome.

D. REVIEW ANALYSIS

If review_status = "No Active Review" and no review was triggered:
State that no human review was required.

If a human review was triggered:
Explain:
* Review type (Evaluation, Operational, or Governance)
* Specific review reason / trigger (e.g., latency threshold, safety performance, or mandatory regulated risk governance review)

E. HUMAN DECISION

If no human review action is recorded (Pending Review):
State clearly that no human review decision has been recorded yet and the agent is awaiting human review.

If human_review_action = Approved:
Explain:
* State that the human reviewer approved the promotion from previous state to the target state.
* Seamlessly integrate the reviewer's justification (e.g., "The human reviewer approved the promotion, noting: '[Human Review Notes]'"). Avoid robotic phrasing like "The reason for approval using Human Review Notes is".

If human_review_action = Rejected:
Explain:
* State that the human reviewer rejected the promotion from previous state to the target state.
* Seamlessly integrate the reviewer's feedback (e.g., "The human reviewer rejected the promotion, citing: '[Human Review Notes]'"). Avoid robotic phrasing like "The reason for rejection using Human Review Notes is".

If human_review_action = On Hold:
Explain:
* State that the human reviewer placed the promotion on hold.
* Seamlessly integrate the reviewer's hold rationale (e.g., "The human reviewer placed the promotion on hold, noting: '[Human Review Notes]'"). Avoid robotic phrasing.

F. NEXT STEPS

Conclude with a clear statement explaining:
* Why the agent remains in its current stage (e.g., rejected by human reviewer due to missing controls, or awaiting pending human review sign-off).
* OR what is required for the agent to advance.
* OR that the agent has successfully been promoted.

OUTPUT LENGTH

Target 100-300 words.
The response should feel like an explanation generated by an AI governance platform, not a generic LLM summary.
The final answer must completely explain why the agent is currently in its lifecycle stage.`;

function buildPrompt(context: Record<string, unknown>): string {
  const c = context as Record<string, unknown>;
  return `Agent: ${c.agent_name}
Current Stage: ${c.current_lifecycle_state}
Promotion Target: ${c.promotion_target}
Overall Score: ${c.overall_score}/10
Evaluation Result: ${c.eval_result}
Quantitative Threshold Result: ${c.quantitative_threshold_result}
Governance Status: ${c.governance_status}
Review Status: ${c.review_status}
Review Type: ${c.review_type || 'None'}
Review Reason: ${c.review_reason || 'N/A'}
Critical Metrics Passed: ${Array.isArray(c.critical_metrics_passed) ? c.critical_metrics_passed.join(', ') || 'None' : 'None'}
Critical Metrics Failed: ${Array.isArray(c.critical_metrics_failed) ? c.critical_metrics_failed.join(', ') || 'None' : 'None'}
Strongest Metrics: ${Array.isArray(c.strongest_metrics) ? c.strongest_metrics.join(', ') || 'None' : 'None'}
Weakest Metrics: ${Array.isArray(c.weakest_metrics) ? c.weakest_metrics.join(', ') || 'None' : 'None'}
Threshold Status: ${c.threshold_status}
Human Review Action: ${c.human_review_action || 'None'}
Human Review Previous State: ${c.human_review_previous_state || 'N/A'}
Human Review Target State: ${c.human_review_target_state || 'N/A'}
Human Review Notes: ${c.human_review_notes || 'N/A'}`;
}

const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const context = body?.context;
    if (!context || typeof context !== "object") {
      return new Response(
        JSON.stringify({ error: "Missing 'context' field in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = buildPrompt(context);

    let lastError = "";
    for (const model of MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: SYSTEM_PROMPT },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1024,
            },
          }),
        });

        if (!response.ok) {
          lastError = `${model}: ${response.status} ${await response.text().catch(() => "")}`;
          continue;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (!text) {
          lastError = `${model}: empty response`;
          continue;
        }

        return new Response(
          JSON.stringify({ explanation: text }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }
    }

    return new Response(
      JSON.stringify({ error: `All Gemini models failed. Last error: ${lastError}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
