import { renderStateSurface } from "../src/ui-state.js";

export default {
  title: "JETT/System states",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "The same semantic state surface used by the production JETT evidence route.",
      },
    },
  },
};

const story = (name) => ({ render: () => `<main class="state-story">${renderStateSurface(name)}</main>` });

export const Loading = story("loading");
export const Empty = story("empty");
export const Offline = story("offline");
export const Permission = story("permission");
export const Error = story("error");
export const Recovery = story("recovery");
