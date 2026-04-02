import { Stagehand } from "@browserbasehq/stagehand";
export interface DomElement {
    tag: string;
    id: string;
    className: string;
    ariaLabel: string;
    textContent: string;
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
/**
 * Extract real DOM information using Stagehand's page directly.
 */
export declare function extractRealDomInfo(stagehand: Stagehand, url: string): Promise<DomElement[]>;
//# sourceMappingURL=sectionDom.d.ts.map