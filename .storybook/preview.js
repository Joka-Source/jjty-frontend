import "../src/style.css";

export const parameters = {
  controls: { disable: true },
  options: { storySort: { order: ["JETT", "System states"] } },
  viewport: {
    options: {
      phone: { name: "Phone · 375", styles: { width: "375px", height: "812px" } },
      desktop: { name: "Desktop · 1280", styles: { width: "1280px", height: "900px" } },
    },
  },
};
