import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";

interface Position {
  start?: { offset?: number };
  end?: { offset?: number };
}

interface AstNode {
  type?: string;
  checked?: boolean | null;
  position?: Position;
  children?: AstNode[];
}

interface GfmTask {
  checked: boolean;
  markerStart: number;
  markerEnd: number;
}

const parser = unified().use(remarkParse).use(remarkGfm);

function taskMarkerRange(
  node: AstNode,
  markdown: string
): {
  markerStart: number;
  markerEnd: number;
} | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (start === undefined || end === undefined) return null;

  // remark-gfm has already established that this list item is a task. Its
  // source range may span nested lists, but the task marker is necessarily
  // the first checkbox marker in that range, including after a bare list
  // marker on the preceding physical line.
  const marker = /\[[ xX]\]/.exec(markdown.slice(start, end));
  if (!marker) return null;

  return {
    markerStart: start + marker.index + 1,
    markerEnd: start + marker.index + 2,
  };
}

function walk(node: AstNode, tasks: GfmTask[], markdown: string): void {
  if (node.type === "listItem" && typeof node.checked === "boolean") {
    const marker = taskMarkerRange(node, markdown);
    if (marker) {
      tasks.push({ checked: node.checked, ...marker });
    }
  }

  for (const child of node.children ?? []) {
    walk(child, tasks, markdown);
  }
}

/**
 * Return GFM task checkboxes in mdast document order.
 *
 * The parser is intentionally shared with the Markdown renderer's
 * remark-gfm pipeline. Positions point at the actual source checkbox state,
 * so callers never need to reconstruct CommonMark list/fence rules.
 */
function listGfmTasks(markdown: string): GfmTask[] {
  const tree = parser.parse(markdown) as unknown as AstNode;
  const tasks: GfmTask[] = [];
  walk(tree, tasks, markdown);
  return tasks;
}

/**
 * Toggle the GFM task checkbox at a zero-based document-order index.
 */
export function toggleTaskAt(markdown: string, index: number): string | null {
  if (!Number.isInteger(index) || index < 0) return null;

  const tasks = listGfmTasks(markdown);
  const task = tasks[index];
  if (!task) return null;

  const nextState = task.checked ? " " : "x";
  return (
    markdown.slice(0, task.markerStart) +
    nextState +
    markdown.slice(task.markerEnd)
  );
}
