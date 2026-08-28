import { render, screen } from "@testing-library/react-native";
import TestimonialCarousel from "../../components/TestimonialCarousel.jsx";
import Sparkles from "../../components/Sparkles.jsx";

describe("TestimonialCarousel", () => {
  it("renders a five-star rating and an opening quote", async () => {
    await render(<TestimonialCarousel />);

    expect(screen.getByLabelText("Rated five stars")).toBeTruthy();
    expect(screen.getByText(/gentlest part of my morning/)).toBeTruthy();
  });
});

describe("Sparkles", () => {
  it("mounts without crashing", async () => {
    // Pure decoration — this just guards against a broken import or animation setup.
    await render(<Sparkles />);
  });
});
