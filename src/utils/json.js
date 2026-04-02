export function extractJsonFromResponse(response) {
    const jsonString = response.trim();
    const jsonMatch = jsonString.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
        return jsonMatch[1];
    }
    const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
        return jsonObjectMatch[0];
    }
    return null;
}
//# sourceMappingURL=json.js.map