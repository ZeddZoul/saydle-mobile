import { render, screen } from "@testing-library/react-native";
import Sparkles from "../../components/Sparkles.jsx";
import en from "../../locales/en.json";

/**
 * The testimonial carousel used to live here, with its five fabricated stars.
 * It was removed for launch — a store reviewer reads the landing screen too —
 * and this now guards against it quietly coming back.
 */
describe("the landing copy", () => {
  it("makes a claim about the product, not invented praise for it", () => {
    expect(en.landing.proof).toMatch(/affirmation/i);
    expect(en.landing.rating).toBeUndefined();
    expect(en.landing.testimonials).toBeUndefined();
  });
});

describe("Sparkles", () => {
  it("mounts without crashing", async () => {
    // Pure decoration — this just guards against a broken import or animation setup.
    await render(<Sparkles />);
    expect(screen).toBeTruthy();
  });
});
