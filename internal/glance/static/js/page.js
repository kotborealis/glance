import { setupPopovers, cleanupPopovers } from './popover.js';
import { setupMasonries, cleanupMasonries } from './masonry.js';
import { cleanupTodos } from './todo.js';
import { throttledDebounce, isElementVisible, openURLInNewTab } from './utils.js';
import { elem, find, findAll } from './templating.js';

async function fetchPageContent(pageData) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
        const response = await fetch(`${pageData.baseURL}/api/pages/${encodeURIComponent(pageData.slug)}/content/`, {
            credentials: "same-origin",
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Page content request failed: ${response.status} ${response.statusText}`);
        }
        return await response.text();
    } finally {
        clearTimeout(timeout);
    }
}

let carouselResizeListenerInstalled = false;

function setupCarousels(root) {
    const carouselElements = root.getElementsByClassName("carousel-container");

    if (carouselElements.length == 0) {
        return;
    }

    for (let i = 0; i < carouselElements.length; i++) {
        const carousel = carouselElements[i];
        carousel.classList.add("show-right-cutoff");
        const itemsContainer = carousel.getElementsByClassName("carousel-items-container")[0];

        const determineSideCutoffs = () => {
            if (itemsContainer.scrollLeft != 0) {
                carousel.classList.add("show-left-cutoff");
            } else {
                carousel.classList.remove("show-left-cutoff");
            }

            if (Math.ceil(itemsContainer.scrollLeft) + itemsContainer.clientWidth < itemsContainer.scrollWidth) {
                carousel.classList.add("show-right-cutoff");
            } else {
                carousel.classList.remove("show-right-cutoff");
            }
        }

        const determineSideCutoffsRateLimited = throttledDebounce(determineSideCutoffs, 20, 100);

        itemsContainer.addEventListener("scroll", determineSideCutoffsRateLimited);
        afterContentReady(determineSideCutoffs);
    }

    if (!carouselResizeListenerInstalled) {
        window.addEventListener("resize", () => {
            document.querySelectorAll(".carousel-container .carousel-items-container").forEach((items) => {
                items.dispatchEvent(new Event("scroll"));
            });
        });
        carouselResizeListenerInstalled = true;
    }
}

const minuteInSeconds = 60;
const hourInSeconds = minuteInSeconds * 60;
const dayInSeconds = hourInSeconds * 24;
const monthInSeconds = dayInSeconds * 30.4;
const yearInSeconds = dayInSeconds * 365;

function timestampToRelativeTime(timestamp) {
    let delta = Math.round((Date.now() / 1000) - timestamp);
    let prefix = "";

    if (delta < 0) {
        delta = -delta;
        prefix = "in ";
    }

    if (delta < minuteInSeconds) {
        return prefix + "1m";
    }
    if (delta < hourInSeconds) {
        return prefix + Math.floor(delta / minuteInSeconds) + "m";
    }
    if (delta < dayInSeconds) {
        return prefix + Math.floor(delta / hourInSeconds) + "h";
    }
    if (delta < monthInSeconds) {
        return prefix + Math.floor(delta / dayInSeconds) + "d";
    }
    if (delta < yearInSeconds) {
        return prefix + Math.floor(delta / monthInSeconds) + "mo";
    }

    return prefix + Math.floor(delta / yearInSeconds) + "y";
}

function updateRelativeTimeForElements(elements)
{
    for (let i = 0; i < elements.length; i++)
    {
        const element = elements[i];
        const timestamp = element.dataset.dynamicRelativeTime;

        if (timestamp === undefined)
            continue

        element.textContent = timestampToRelativeTime(timestamp);
    }
}

let searchShortcutListenerInstalled = false;

function setupSearchBoxes(root) {
    const searchWidgets = root.getElementsByClassName("search");

    if (searchWidgets.length == 0) {
        return;
    }

    for (let i = 0; i < searchWidgets.length; i++) {
        const widget = searchWidgets[i];
        const defaultSearchUrl = widget.dataset.defaultSearchUrl;
        const target = widget.dataset.target || "_blank";
        const newTab = widget.dataset.newTab === "true";
        const inputElement = widget.getElementsByClassName("search-input")[0];
        const bangElement = widget.getElementsByClassName("search-bang")[0];
        const bangs = widget.querySelectorAll(".search-bangs > input");
        const bangsMap = {};
        const kbdElement = widget.getElementsByTagName("kbd")[0];
        let currentBang = null;
        let lastQuery = "";

        for (let j = 0; j < bangs.length; j++) {
            const bang = bangs[j];
            bangsMap[bang.dataset.shortcut] = bang;
        }

        const handleKeyDown = (event) => {
            if (event.key == "Escape") {
                inputElement.blur();
                return;
            }

            if (event.key == "Enter") {
                const input = inputElement.value.trim();
                let query;
                let searchUrlTemplate;

                if (currentBang != null) {
                    query = input.slice(currentBang.dataset.shortcut.length + 1);
                    searchUrlTemplate = currentBang.dataset.url;
                } else {
                    query = input;
                    searchUrlTemplate = defaultSearchUrl;
                }
                if (query.length == 0 && currentBang == null) {
                    return;
                }

                const url = searchUrlTemplate.replace("!QUERY!", encodeURIComponent(query));

                if (newTab && !event.ctrlKey || !newTab && event.ctrlKey) {
                    window.open(url, target).focus();
                } else {
                    window.location.href = url;
                }

                lastQuery = query;
                inputElement.value = "";
                changeCurrentBang(null);

                return;
            }

            if (event.key == "ArrowUp" && lastQuery.length > 0) {
                inputElement.value = lastQuery;
                return;
            }
        };

        const changeCurrentBang = (bang) => {
            currentBang = bang;
            bangElement.textContent = bang != null ? bang.dataset.title : "";
        }

        const handleInput = (event) => {
            const value = event.target.value.trim();
            if (value in bangsMap) {
                changeCurrentBang(bangsMap[value]);
                return;
            }

            const words = value.split(" ");
            if (words.length >= 2 && words[0] in bangsMap) {
                changeCurrentBang(bangsMap[words[0]]);
                return;
            }

            changeCurrentBang(null);
        };

        inputElement.addEventListener("keydown", handleKeyDown);
        inputElement.addEventListener("input", handleInput);

        kbdElement.addEventListener("mousedown", () => {
            requestAnimationFrame(() => inputElement.focus());
        });
    }

    if (!searchShortcutListenerInstalled) {
        document.addEventListener("keydown", (event) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || event.code != "KeyS") return;
            const input = document.querySelector(".search .search-input");
            if (!input) return;
            input.focus();
            event.preventDefault();
        });
        searchShortcutListenerInstalled = true;
    }
}

let relativeTimeTimer = null;
let relativeTimeListenerInstalled = false;

function setupDynamicRelativeTime() {
    if (!document.querySelector("#page-content [data-dynamic-relative-time]")) return;
    const updateInterval = 60 * 1000;

    const updateElementsAndTimestamp = () => {
        updateRelativeTimeForElements(document.querySelectorAll("#page-content [data-dynamic-relative-time]"));
    };

    if (!relativeTimeListenerInstalled) {
        const scheduleRepeatingUpdate = () => relativeTimeTimer = setInterval(updateElementsAndTimestamp, updateInterval);

        if (document.hidden === undefined) {
            scheduleRepeatingUpdate();
        } else {
            scheduleRepeatingUpdate();
            document.addEventListener("visibilitychange", () => {
                if (document.hidden) {
                    clearInterval(relativeTimeTimer);
                    return;
                }

                updateElementsAndTimestamp();
                clearInterval(relativeTimeTimer);
                relativeTimeTimer = setInterval(updateElementsAndTimestamp, updateInterval);
            });
        }
        relativeTimeListenerInstalled = true;
    }

    updateElementsAndTimestamp();
}

function setupGroups(root) {
    const groups = root.getElementsByClassName("widget-type-group");

    if (groups.length == 0) {
        return;
    }

    for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const titles = group.getElementsByClassName("widget-header")[0].children;
        const tabs = group.getElementsByClassName("widget-group-contents")[0].children;
        let current = 0;

        for (let t = 0; t < titles.length; t++) {
            const title = titles[t];

            if (title.dataset.titleUrl !== undefined) {
                title.addEventListener("mousedown", (event) => {
                    if (event.button != 1) {
                        return;
                    }

                    openURLInNewTab(title.dataset.titleUrl, false);
                    event.preventDefault();
                });
            }

            title.addEventListener("click", () => {
                if (t == current) {
                    if (title.dataset.titleUrl !== undefined) {
                        openURLInNewTab(title.dataset.titleUrl);
                    }

                    return;
                }

                for (let i = 0; i < titles.length; i++) {
                    titles[i].classList.remove("widget-group-title-current");
                    titles[i].setAttribute("aria-selected", "false");
                    tabs[i].classList.remove("widget-group-content-current");
                    tabs[i].setAttribute("aria-hidden", "true");
                }

                if (current < t) {
                    tabs[t].dataset.direction = "right";
                } else {
                    tabs[t].dataset.direction = "left";
                }

                current = t;

                title.classList.add("widget-group-title-current");
                title.setAttribute("aria-selected", "true");
                tabs[t].classList.add("widget-group-content-current");
                tabs[t].setAttribute("aria-hidden", "false");
            });
        }
    }
}

function setupLazyImages(root) {
    const images = root.querySelectorAll("img[loading=lazy]");

    if (images.length == 0) {
        return;
    }

    function imageFinishedTransition(image) {
        image.classList.add("finished-transition");
    }

    afterContentReady(() => {
        setTimeout(() => {
            for (let i = 0; i < images.length; i++) {
                const image = images[i];

                if (image.complete) {
                    image.classList.add("cached");
                    setTimeout(() => imageFinishedTransition(image), 1);
                } else {
                    // TODO: also handle error event
                    image.addEventListener("load", () => {
                        image.classList.add("loaded");
                        setTimeout(() => imageFinishedTransition(image), 400);
                    });
                }
            }
        }, 1);
    });
}

function attachExpandToggleButton(collapsibleContainer) {
    const showMoreText = "Show more";
    const showLessText = "Show less";

    let expanded = false;
    const button = document.createElement("button");
    const icon = document.createElement("span");
    icon.classList.add("expand-toggle-button-icon");
    const textNode = document.createTextNode(showMoreText);
    button.classList.add("expand-toggle-button");
    button.append(textNode, icon);
    button.addEventListener("click", () => {
        expanded = !expanded;

        if (expanded) {
            collapsibleContainer.classList.add("container-expanded");
            button.classList.add("container-expanded");
            textNode.nodeValue = showLessText;
            return;
        }

        const topBefore = button.getClientRects()[0].top;

        collapsibleContainer.classList.remove("container-expanded");
        button.classList.remove("container-expanded");
        textNode.nodeValue = showMoreText;

        const topAfter = button.getClientRects()[0].top;

        if (topAfter > 0)
            return;

        window.scrollBy({
            top: topAfter - topBefore,
            behavior: "instant"
        });
    });

    collapsibleContainer.after(button);

    return button;
};


function setupCollapsibleLists(root) {
    const collapsibleLists = root.querySelectorAll(".list.collapsible-container");

    if (collapsibleLists.length == 0) {
        return;
    }

    for (let i = 0; i < collapsibleLists.length; i++) {
        const list = collapsibleLists[i];

        if (list.dataset.collapseAfter === undefined) {
            continue;
        }

        const collapseAfter = parseInt(list.dataset.collapseAfter);

        if (collapseAfter == -1) {
            continue;
        }

        if (list.children.length <= collapseAfter) {
            continue;
        }

        attachExpandToggleButton(list);

        for (let c = collapseAfter; c < list.children.length; c++) {
            const child = list.children[c];
            child.classList.add("collapsible-item");
            child.style.animationDelay = ((c - collapseAfter) * 20).toString() + "ms";
        }
    }
}

const contentObservers = new Set();
const contentCleanupCallbacks = new Set();

function setupCollapsibleGrids(root) {
    const collapsibleGridElements = root.querySelectorAll(".cards-grid.collapsible-container");

    if (collapsibleGridElements.length == 0) {
        return;
    }

    for (let i = 0; i < collapsibleGridElements.length; i++) {
        const gridElement = collapsibleGridElements[i];

        if (gridElement.dataset.collapseAfterRows === undefined) {
            continue;
        }

        const collapseAfterRows = parseInt(gridElement.dataset.collapseAfterRows);

        if (collapseAfterRows == -1) {
            continue;
        }

        const getCardsPerRow = () => {
            return parseInt(getComputedStyle(gridElement).getPropertyValue('--cards-per-row'));
        };

        const button = attachExpandToggleButton(gridElement);

        let cardsPerRow;

        const resolveCollapsibleItems = () => requestAnimationFrame(() => {
            const hideItemsAfterIndex = cardsPerRow * collapseAfterRows;

            if (hideItemsAfterIndex >= gridElement.children.length) {
                button.style.display = "none";
            } else {
                button.style.removeProperty("display");
            }

            let row = 0;

            for (let i = 0; i < gridElement.children.length; i++) {
                const child = gridElement.children[i];

                if (i >= hideItemsAfterIndex) {
                    child.classList.add("collapsible-item");
                    child.style.animationDelay = (row * 40).toString() + "ms";

                    if (i % cardsPerRow + 1 == cardsPerRow) {
                        row++;
                    }
                } else {
                    child.classList.remove("collapsible-item");
                    child.style.removeProperty("animation-delay");
                }
            }
        });

        const observer = new ResizeObserver(() => {
            if (!isElementVisible(gridElement)) {
                return;
            }

            const newCardsPerRow = getCardsPerRow();

            if (cardsPerRow == newCardsPerRow) {
                return;
            }

            cardsPerRow = newCardsPerRow;
            resolveCollapsibleItems();
        });
        contentObservers.add(observer);

        afterContentReady(() => observer.observe(gridElement));
    }
}

let contentReadyCallbacks = [];

function afterContentReady(callback) {
    contentReadyCallbacks.push(callback);
}

const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function makeSettableTimeElement(element, hourFormat) {
    const fragment = document.createDocumentFragment();
    const hour = document.createElement('span');
    const minute = document.createElement('span');
    const amPm = document.createElement('span');
    fragment.append(hour, document.createTextNode(':'), minute);

    if (hourFormat == '12h') {
        fragment.append(document.createTextNode(' '), amPm);
    }

    element.append(fragment);

    return (date) => {
        const hours = date.getHours();

        if (hourFormat == '12h') {
            amPm.textContent = hours < 12 ? 'AM' : 'PM';
            hour.textContent = hours % 12 || 12;
        } else {
            hour.textContent = hours < 10 ? '0' + hours : hours;
        }

        const minutes = date.getMinutes();
        minute.textContent = minutes < 10 ? '0' + minutes : minutes;
    };
};

function timeInZone(now, zone) {
    let timeInZone;

    try {
        timeInZone = new Date(now.toLocaleString('en-US', { timeZone: zone }));
    } catch (e) {
        // TODO: indicate to the user that this is an invalid timezone
        console.error(e);
        timeInZone = now
    }

    const diffInMinutes = Math.round((timeInZone.getTime() - now.getTime()) / 1000 / 60);

    return { time: timeInZone, diffInMinutes: diffInMinutes };
}

function zoneDiffText(diffInMinutes) {
    if (diffInMinutes == 0) {
        return "";
    }

    const sign = diffInMinutes < 0 ? "-" : "+";
    const signText = diffInMinutes < 0 ? "behind" : "ahead";

    diffInMinutes = Math.abs(diffInMinutes);

    const hours = Math.floor(diffInMinutes / 60);
    const minutes = diffInMinutes % 60;
    const hourSuffix = hours == 1 ? "" : "s";

    if (minutes == 0) {
        return { text: `${sign}${hours}h`, title: `${hours} hour${hourSuffix} ${signText}` };
    }

    if (hours == 0) {
        return { text: `${sign}${minutes}m`, title: `${minutes} minutes ${signText}` };
    }

    return { text: `${sign}${hours}h~`, title: `${hours} hour${hourSuffix} and ${minutes} minutes ${signText}` };
}

const clockUpdaters = new WeakMap();
let clockTimer = null;

function setupClocks(root) {
    if (root.querySelectorAll(".clock").length === 0) {
        if (clockTimer !== null) clearTimeout(clockTimer);
        clockTimer = null;
        return;
    }

    const updateClocks = () => {
        const now = new Date();
        document.querySelectorAll("#page-content .clock").forEach((clock) => {
            let updater = clockUpdaters.get(clock);
            if (!updater) {
                const hourFormat = clock.dataset.hourFormat;
                const localTime = clock.querySelector('[data-local-time]');
                const localDate = localTime.querySelector('[data-date]');
                const weekday = localTime.querySelector('[data-weekday]');
                const year = localTime.querySelector('[data-year]');
                const setLocalTime = makeSettableTimeElement(localTime.querySelector('[data-time]'), hourFormat);
                const zones = Array.from(clock.querySelectorAll('[data-time-in-zone]')).map((zone) => {
                    const setTime = makeSettableTimeElement(zone.querySelector('[data-time]'), hourFormat);
                    const diff = zone.querySelector('[data-time-diff]');
                    return (currentTime) => {
                        const { time, diffInMinutes } = timeInZone(currentTime, zone.dataset.timeInZone);
                        setTime(time);
                        const text = zoneDiffText(diffInMinutes);
                        diff.textContent = text.text || "";
                        diff.title = text.title || "";
                    };
                });
                updater = (currentTime) => {
                    setLocalTime(currentTime);
                    localDate.textContent = currentTime.getDate() + ' ' + monthNames[currentTime.getMonth()];
                    weekday.textContent = weekDayNames[currentTime.getDay()];
                    year.textContent = currentTime.getFullYear();
                    zones.forEach((update) => update(currentTime));
                };
                clockUpdaters.set(clock, updater);
            }
            updater(now);
        });
        clockTimer = setTimeout(updateClocks, (60 - now.getSeconds()) * 1000);
    };

    if (clockTimer !== null) clearTimeout(clockTimer);
    root.querySelectorAll(".clock").forEach((clock) => clockUpdaters.delete(clock));
    updateClocks();
}

async function setupCalendars(root) {
    const elems = root.getElementsByClassName("calendar");
    if (elems.length == 0) return;

    // TODO: implement prefetching, currently loads as a nasty waterfall of requests
    const calendar = await import ('./calendar.js');

    for (let i = 0; i < elems.length; i++) {
        const initialized = calendar.default(elems[i]);
        if (initialized?.component?.suspend) {
            contentCleanupCallbacks.add(() => initialized.component.suspend());
        }
    }
}

async function setupTodos(root) {
    const elems = Array.from(root.getElementsByClassName("todo"));
    if (elems.length == 0) return;

    const todo = await import ('./todo.js');

    for (let i = 0; i < elems.length; i++){
        todo.default(elems[i]);
    }
}

function setupTruncatedElementTitles(root) {
    const elements = root.querySelectorAll(".text-truncate, .single-line-titles .title, .text-truncate-2-lines, .text-truncate-3-lines");

    if (elements.length == 0) {
        return;
    }

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (element.getAttribute("title") === null)
            element.title = element.innerText.trim().replace(/\s+/g, " ");
    }
}

async function changeTheme(key, onChanged) {
    const themeStyleElem = find("#theme-style");

    const response = await fetch(`${pageData.baseURL}/api/set-theme/${key}`, {
        method: "POST",
    });

    if (response.status != 200) {
        alert("Failed to set theme: " + response.statusText);
        return;
    }
    const newThemeStyle = await response.text();

    const tempStyle = elem("style")
        .html("* { transition: none !important; }")
        .appendTo(document.head);

    themeStyleElem.html(newThemeStyle);
    document.documentElement.setAttribute("data-theme", key);
    document.documentElement.setAttribute("data-scheme", response.headers.get("X-Scheme"));
    typeof onChanged == "function" && onChanged();
    setTimeout(() => { tempStyle.remove(); }, 10);
}

function initThemePicker() {
    const themeChoicesInMobileNav = find(".mobile-navigation .theme-choices");
    if (!themeChoicesInMobileNav) return;

    const themeChoicesInHeader = find(".header-container .theme-choices");

    if (themeChoicesInHeader) {
        themeChoicesInHeader.replaceWith(
            themeChoicesInMobileNav.cloneNode(true)
        );
    }

    const presetElems = findAll(".theme-choices .theme-preset");
    let themePreviewElems = document.getElementsByClassName("current-theme-preview");
    let isLoading = false;

    presetElems.forEach((presetElement) => {
        const themeKey = presetElement.dataset.key;

        if (themeKey === undefined) {
            return;
        }

        if (themeKey == pageData.theme) {
            presetElement.classList.add("current");
        }

        presetElement.addEventListener("click", () => {
            if (themeKey == pageData.theme) return;
            if (isLoading) return;

            isLoading = true;
            changeTheme(themeKey, function() {
                isLoading = false;
                pageData.theme = themeKey;
                presetElems.forEach((e) => { e.classList.remove("current"); });

                Array.from(themePreviewElems).forEach((preview) => {
                    preview.querySelector(".theme-preset").replaceWith(
                        presetElement.cloneNode(true)
                    );
                })

                presetElems.forEach((e) => {
                    if (e.dataset.key != themeKey) return;
                    e.classList.add("current");
                });
            });
        });
    })
}

function cleanupPageContent(root) {
    cleanupPopovers(root);
    contentCleanupCallbacks.forEach((cleanup) => cleanup());
    contentCleanupCallbacks.clear();
    contentObservers.forEach((observer) => observer.disconnect());
    contentObservers.clear();
    cleanupMasonries();
    cleanupTodos();
    contentReadyCallbacks = [];
}

async function initializePageContent(root) {
    setupPopovers(root);
    setupClocks(root);
    await setupCalendars(root);
    await setupTodos(root);
    setupCarousels(root);
    setupSearchBoxes(root);
    setupCollapsibleLists(root);
    setupCollapsibleGrids(root);
    setupGroups(root);
    setupMasonries(root);
    setupDynamicRelativeTime();
    setupLazyImages(root);

    const callbacks = contentReadyCallbacks;
    contentReadyCallbacks = [];
    callbacks.forEach((callback) => callback());
    setupTruncatedElementTitles(root);
}

async function refreshPageContent(root) {
    if (pageData.refreshInterval <= 0) return;

    const countdown = document.getElementById("refresh-countdown");
    const refreshIntervalMs = pageData.refreshInterval * 1000;
    let refreshDeadline = Date.now() + refreshIntervalMs;
    let resolveRefreshDeadline = null;

    const updateCountdown = () => {
        const secondsRemaining = Math.max(0, Math.ceil((refreshDeadline - Date.now()) / 1000));
        if (countdown) countdown.textContent = `${secondsRemaining}s`;
        if (secondsRemaining === 0 && resolveRefreshDeadline) {
            const resolve = resolveRefreshDeadline;
            resolveRefreshDeadline = null;
            resolve();
        }
    };

    updateCountdown();
    const countdownTimer = setInterval(updateCountdown, 1000);
    const resetCountdown = () => {
        refreshDeadline = Date.now() + refreshIntervalMs;
        updateCountdown();
    };

    while (pageData.refreshInterval > 0) {
        await new Promise((resolve) => { resolveRefreshDeadline = resolve; });
        if (hasFocusedEditableContent(root)) {
            resetCountdown();
            continue;
        }

        let html;
        try {
            html = await fetchPageContent(pageData);
        } catch (error) {
            console.warn(error);
            resetCountdown();
            continue;
        }
        if (hasFocusedEditableContent(root)) {
            resetCountdown();
            continue;
        }

        const scrollY = window.scrollY;
        cleanupPageContent(root);
        root.innerHTML = html;
        try {
            await initializePageContent(root);
        } catch (error) {
            console.error("Failed to initialize refreshed page content", error);
        } finally {
            window.scrollTo(0, scrollY);
            resetCountdown();
        }
    }

    clearInterval(countdownTimer);
}

function hasFocusedEditableContent(root) {
    const activeElement = document.activeElement;
    return root.contains(activeElement) && (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement.isContentEditable
    );
}

async function setupPage() {
    initThemePicker();
    const pageElement = document.getElementById("page");
    const pageContentElement = document.getElementById("page-content");

    try {
        pageContentElement.innerHTML = await fetchPageContent(pageData);
        await initializePageContent(pageContentElement);
    } catch (error) {
        console.error("Failed to load page content", error);
        pageContentElement.textContent = "Failed to load page content.";
    } finally {
        pageElement.classList.add("content-ready");
        pageElement.setAttribute("aria-busy", "false");
        setTimeout(() => document.body.classList.add("page-columns-transitioned"), 300);
    }

    refreshPageContent(pageContentElement);
}

setupPage();
