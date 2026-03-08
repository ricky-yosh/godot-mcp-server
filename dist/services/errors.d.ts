export declare function formatError(error: unknown): string;
export declare function toolError(error: unknown): {
    isError: boolean;
    content: {
        type: "text";
        text: string;
    }[];
};
export declare function toolOk(text: string): {
    content: {
        type: "text";
        text: string;
    }[];
};
