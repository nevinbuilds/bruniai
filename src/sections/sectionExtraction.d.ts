import { Stagehand } from "@browserbasehq/stagehand";
import { DomElement } from "./sectionDom.js";
/**
 * Section data parsed from analysis output.
 */
export interface SectionData {
    name: string;
    sectionId: string;
    htmlElement: string | null;
    htmlId: string | null;
    htmlClasses: string | null;
    ariaLabel: string | null;
    contentIdentifier: string | null;
}
/**
 * DOM section with additional metadata from analysis.
 */
export interface EnrichedSection extends DomElement {
    sectionId: string;
    matchedAnalysis: SectionData | null;
    dataAttributes: Record<string, string>;
}
/**
 * Parse section data from the formatted analysis output string.
 *
 * @param sectionsAnalysis - String output from the section analysis
 * @returns Array of section data objects
 */
export declare function parseSectionDataFromAnalysis(sectionsAnalysis: string): SectionData[];
/**
 * Extract section bounding boxes and match them with section data from analysis.
 *
 * @param stagehand - Stagehand instance
 * @param url - URL to analyze
 * @param sectionsAnalysis - Optional analysis output containing section data
 * @returns Array of enriched sections with bounding boxes and matched IDs
 */
export declare function extractSectionBoundingBoxes(stagehand: Stagehand, url: string, sectionsAnalysis?: string): Promise<EnrichedSection[]>;
/**
 * Take a screenshot of a specific section using its ID and analysis data.
 *
 * @param stagehand - Stagehand instance
 * @param url - URL to screenshot
 * @param outputPath - Path to save the screenshot
 * @param sectionId - The section ID to target
 * @param sectionsAnalysis - The sections analysis data containing section information
 * @returns True if successful, False otherwise
 */
export declare function takeSectionScreenshot(stagehand: Stagehand, url: string, outputPath: string, sectionId: string, sectionsAnalysis: string): Promise<boolean>;
//# sourceMappingURL=sectionExtraction.d.ts.map