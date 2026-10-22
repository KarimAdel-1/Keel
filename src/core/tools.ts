// A tool an agent can call (an action), as the model sees it: a name, what it's for, and the JSON Schema of its
// arguments.

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

