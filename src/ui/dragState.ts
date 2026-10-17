/* What is being dragged from a panel right now. HTML5 drag events can't read
 * dataTransfer during dragover, so the source is kept here. */
export type DragSource = { kind: "part"; id: string } | { kind: "component"; id: string } | { kind: "image"; } | null;

let current: DragSource = null;
export const setDragSource = (d: DragSource) => (current = d);
export const getDragSource = () => current;
