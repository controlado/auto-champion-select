import { LEAGUE_CLIENT_ELEMENTS, LEAGUE_CLIENT_SELECTORS } from "./league-client-dom.js";

const SOCIAL_ROSTER_SECTION_CLASS = "auto-select-social-roster-section";
const SOCIAL_ROSTER_SECTION_HEADER_CLASS = "auto-select-social-roster-section__header";

export class SocialRosterSection {
    /**
     * @param {string} label
     * @param {...HTMLElement} collapsibleElements
     */
    constructor(label, ...collapsibleElements) {
        this.element = document.createElement(LEAGUE_CLIENT_ELEMENTS.socialRosterGroup);
        this.element.classList.add(SOCIAL_ROSTER_SECTION_CLASS);
        this.element.addEventListener("post-render", () => this.onPostRender());
        this.element.addEventListener("click", () => this.onClick());

        this.label = label;
        this.collapsibleElements = collapsibleElements;
        this.headerAccessoryElement = null;

        this.waitRender();
    }

    waitRender() {
        new MutationObserver((_, observer) => {
            if (this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupLabel)) {
                const newEvent = new Event("post-render");
                this.element.dispatchEvent(newEvent);
                observer.disconnect();
            }
        }).observe(this.element, { childList: true });
    }

    onPostRender() {
        this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupLabel).innerText = this.label;
        const headerElement = this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupHeader);
        headerElement?.removeAttribute("draggable");
        if (headerElement && this.headerAccessoryElement) {
            headerElement.classList.add(SOCIAL_ROSTER_SECTION_HEADER_CLASS);
            headerElement.appendChild(this.headerAccessoryElement);
        }
    }

    /**
     * @param {HTMLElement} element
     * @returns {void}
     */
    setHeaderAccessory(element) {
        this.headerAccessoryElement = element;
        const headerElement = this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupHeader);
        if (headerElement) {
            headerElement.classList.add(SOCIAL_ROSTER_SECTION_HEADER_CLASS);
            headerElement.appendChild(element);
        }
    }

    onClick() {
        this.collapsibleElements.forEach(element => {
            if (!element.closest(".auto-select-champ-select-menu")) {
                element.classList.toggle("hidden");
            }
        });
        this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupArrow)?.toggleAttribute("open");
    }
}
