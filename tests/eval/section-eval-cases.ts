/**
 * Section extraction eval cases.
 *
 * Each case defines a baseline image (filesystem path), optional preview URL,
 * and the expected section names we expect the vision API to return.
 * Add new cases by appending to sectionEvalCases.
 */

export interface SectionEvalCase {
  name: string;
  baseImagePath: string;
  previewUrl: string;
  expectedSections: string[];
}

export const sectionEvalCases: SectionEvalCase[] = [
  {
    name: "Clickr design",
    baseImagePath: "tests/images/design.jpg",
    previewUrl: "https://themewagon.github.io/clickr/v1.0.0/",
    expectedSections: [
      "Header / Navigation",
      "Hero",
      "How it works",
      "Testimonials",
      "Our packages",
      "Portfolio",
      "Services",
      "FAQ",
      "Call to action banner",
      "Footer",
    ],
  },
];
