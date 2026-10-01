import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SizeChartSchema, type ParseChartRequest, type SizeChart } from "@bsc/shared";

export const DEFAULT_MODEL = "claude-opus-5-5";

const INSTRUCTIONS = `You extract clothing size charts from shopping pages.
The input is a screenshot or pasted text of a size chart. Return it as structured data.

Rules:
- "unit": "in" or "cm", as printed in the column headers (e.g. "Chest (in)"). All values share one unit.
- "kind": "garment" if the numbers are measurements of the product itself (headers like "Garment", "Product measurements", "Half chest", "Hem", "Center back length", "Sleeve length"); "body" if they are the body measurements a size fits ("Body size", "Fits chest", "Bust", "Waist", "Hip"); "unknown" if you cannot tell.
- One row per size, in the order printed. "size" is the label as printed (e.g. "S", "M", "XL", "2XL", "38").
- Map columns: chest/bust circumference -> chest; half chest / pit-to-pit / flat chest width -> half_chest; shoulder width -> shoulder; sleeve length -> sleeve; hem/bottom circumference -> hem; body or back length / center back length -> length; waist -> waist; hip -> hip.
- Use null for any measure the chart does not contain. Never invent or estimate values. If a cell is a range like "38-40", use the midpoint.
- Copy numbers exactly as printed. Ignore marketing text and anything that is not the size chart.`;

export class ChartParseError extends Error {}

export type ChartParser = (req: ParseChartRequest) => Promise<SizeChart>;

export function createAnthropicParser(
  client: Anthropic = new Anthropic(),
  model: string = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
): ChartParser {
  return async (req) => {
    const content: Anthropic.ContentBlockParam[] =
      "text" in req
        ? [{ type: "text", text: `Size chart text:\n\n${req.text}` }]
        : [
            { type: "image", source: { type: "base64", media_type: req.mediaType, data: req.imageBase64 } },
            { type: "text", text: "Extract the size chart in this image." },
          ];

    const response = await client.messages.parse({
      model,
      max_tokens: 4096,
      system: INSTRUCTIONS,
      messages: [{ role: "user", content }],
      output_config: { effort: "low", format: zodOutputFormat(SizeChartSchema) },
    });

    if (response.stop_reason === "refusal") throw new ChartParseError("The model declined to read this image.");
    const chart = response.parsed_output;
    if (!chart || chart.rows.length === 0) throw new ChartParseError("No size chart found in the input.");
    return chart;
  };
}
