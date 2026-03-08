export function formatError(error) {
    if (error instanceof Error)
        return `Error: ${error.message}`;
    return `Error: ${String(error)}`;
}
export function toolError(error) {
    return {
        isError: true,
        content: [{ type: "text", text: formatError(error) }]
    };
}
export function toolOk(text) {
    return { content: [{ type: "text", text }] };
}
//# sourceMappingURL=errors.js.map