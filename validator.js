/*
 * CampusConnect registration: client-side validation (UX layer only).
 *
 * Layer 1: HTML constraint attributes in index.html (required, pattern,
 *          minlength/maxlength, type="email").
 * Layer 2: this file. Every rule lives once in FIELDS below; the same
 *          validateField() runs on blur, on input/change (to clear errors as
 *          they are fixed), on Next, and on the final submit sweep.
 *
 * Animations (step slides, shake on failed Next, checklist pops, confetti)
 * are decoration only. They never move focus or change values, and they are
 * switched off when the user asks the OS for reduced motion.
 *
 * Nothing leaves the page and nothing is stored. Passwords stay in the
 * input elements only: they are never copied into the review, the
 * console, storage, or the URL.
 */
(function () {
  "use strict";

  const form = document.getElementById("regForm");
  const sections = Array.from(form.querySelectorAll(".step"));
  const summary = document.getElementById("error-summary");
  const status = document.getElementById("projectStatus");
  const STEP_NAMES = ["Identity", "Security", "Profile", "Review"];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const successCard = document.getElementById("successCard");

  let currentStep = 0;
  let previousStep = 0;          // used only to pick the slide direction
  let returnToReview = false;     // true after an Edit button on the Review step
  let summaryNames = [];          // fields currently listed in the error summary
  const touched = new Set();      // fields the user has changed at least once

  // Clearing the status also hides the decorative success badge, so a stale
  // "every rule passed" never stays on screen after an edit.
  function clearStatus() {
    status.textContent = "";
    successCard.hidden = true;
  }

  /* ---------- Animation helpers (decorative, safe to remove) ---------- */

  // Restart a CSS animation by removing and re-adding its class.
  function replay(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;            // force reflow so the animation starts again
    el.classList.add(className);
  }

  // Shake the controls that just failed so the eye finds them. The CSS only
  // animates under prefers-reduced-motion: no-preference.
  function nudge(names) {
    names.forEach((name) => {
      const field = FIELDS[name];
      (field.group ? [field.group] : field.elements).forEach((el) => replay(el, "shake"));
    });
  }

  /* ---------- Rule helpers (shared, so no rule is copy-pasted) ---------- */

  // Each rule is [test, message]. test(value) returns true when the value passes.
  const required = (msg) => [(v) => v !== "" && v !== false && !(Array.isArray(v) && v.length === 0), msg];
  const maxLength = (n, label) => [(v) => v.length <= n, label + " must be " + n + " characters or fewer (now {len})."];
  const matches = (re, msg) => [(v) => re.test(v), msg];

  const EMAIL_DOMAIN = "student.gsu.edu";

  // Password requirements are defined once and reused by both the
  // validator and the live checklist.
  const PASSWORD_CHECKS = {
    len:    (v) => v.length >= 8,
    upper:  (v) => /[A-Z]/.test(v),
    lower:  (v) => /[a-z]/.test(v),
    digit:  (v) => /[0-9]/.test(v),
    // A symbol is anything that is not an ASCII letter, a digit, or whitespace.
    symbol: (v) => /[^A-Za-z0-9\s]/.test(v)
  };

  /* ---------- Field definitions: the single source of truth ---------- */

  const byId = (id) => document.getElementById(id);
  const tierRadios = Array.from(form.querySelectorAll('input[name="tier"]'));

  const FIELDS = {
    fullname: {
      label: "Full name", step: 0, elements: [byId("fullname")],
      value: () => byId("fullname").value,
      rules: [
        required("Enter your full name."),
        maxLength(80, "Full name"),
        matches(/^[A-Za-z' -]+$/, "Full name can use only letters A–Z, spaces, hyphens (-) and apostrophes (')."),
        matches(/[A-Za-z]/, "Full name must include at least one letter.")
      ]
    },
    campusEmail: {
      label: "Campus email", step: 0, elements: [byId("campusEmail")],
      value: () => byId("campusEmail").value,
      rules: [
        required("Enter your campus email."),
        maxLength(100, "Campus email"),
        matches(/^[^\s@]+@[^\s@]+$/, "Campus email must look like name@student.gsu.edu (one @, no spaces)."),
        // Domain compared case-insensitively, but it must be exactly student.gsu.edu
        // (gsu.edu, mail.student.gsu.edu or student.gsu.edu.com are rejected).
        [(v) => v.split("@")[1].toLowerCase() === EMAIL_DOMAIN, "Campus email must end in @" + EMAIL_DOMAIN + "."]
      ]
    },
    studentId: {
      label: "Student ID", step: 0, elements: [byId("studentId")],
      value: () => byId("studentId").value,
      rules: [
        required("Enter your fictional student ID."),
        matches(/^[0-9]*$/, "Student ID can contain digits only."),
        matches(/^[0-9]{9}$/, "Student ID must be exactly 9 digits (now {len})."),
        matches(/^[1-9]/, "Student ID cannot start with 0.")
      ]
    },
    password: {
      label: "Practice password", step: 1, elements: [byId("password")],
      value: () => byId("password").value,          // never trimmed
      rules: [
        required("Enter a practice password."),
        maxLength(128, "Password"),
        [PASSWORD_CHECKS.len, "Password needs at least 8 characters."],
        [PASSWORD_CHECKS.upper, "Password needs an uppercase letter (A–Z)."],
        [PASSWORD_CHECKS.lower, "Password needs a lowercase letter (a–z)."],
        [PASSWORD_CHECKS.digit, "Password needs a digit (0–9)."],
        [PASSWORD_CHECKS.symbol, "Password needs a symbol such as ! @ # $ (spaces do not count)."]
      ]
    },
    confirm: {
      label: "Confirm password", step: 1, elements: [byId("confirm")],
      value: () => byId("confirm").value,           // never trimmed
      rules: [
        required("Re-enter your practice password."),
        // Exact comparison: "Abc123!x " (trailing space) does not match "Abc123!x".
        [(v) => v === byId("password").value, "Passwords do not match. Re-type the confirmation exactly."]
      ]
    },
    tier: {
      label: "Membership tier", step: 2, elements: tierRadios, group: byId("tierGroup"),
      value: () => { const c = tierRadios.find((r) => r.checked); return c ? c.value : ""; },
      rules: [
        required("Choose a membership tier."),
        [(v) => ["Basic ($25)", "Standard ($50)", "Deluxe ($100)"].includes(v), "Choose one of the listed tiers."]
      ]
    },
    interests: {
      label: "Interests", step: 2, elements: [byId("interests")],
      value: () => Array.from(byId("interests").selectedOptions).map((o) => o.value),
      rules: [
        required("Choose at least one interest."),
        [(v) => v.length <= 3, "Choose no more than 3 interests (now {len})."]
      ]
    },
    bio: {
      label: "Bio", step: 2, elements: [byId("bio")],
      value: () => byId("bio").value,
      // maxlength stops typing past 140, but a value set by script or an old
      // browser can still exceed it, so the length is checked here as well.
      rules: [maxLength(140, "Bio")]
    },
    terms: {
      label: "Terms", step: 2, elements: [byId("terms")],
      value: () => byId("terms").checked,
      rules: [required("You must accept the terms to register.")]
    }
  };
  const FIELD_NAMES = Object.keys(FIELDS);

  // Map every element back to its field name (radios share "tier").
  const fieldOf = new Map();
  FIELD_NAMES.forEach((name) => FIELDS[name].elements.forEach((el) => fieldOf.set(el, name)));

  /* ---------- Validation engine ---------- */

  // Returns the first failing message for a field, or "" when valid.
  function firstError(name) {
    const field = FIELDS[name];
    const value = field.value();
    // Rules run in order and stop at the first failure, so "required" is
    // reported before format rules and the user sees one clear message.
    for (const [test, message] of field.rules) {
      if (!test(value)) return message.replace("{len}", String(value.length));
    }
    return "";
  }

  // Runs the rules, mirrors the result into the Constraint Validation API,
  // falls back to the browser's own message if an HTML constraint still fails,
  // and (optionally) shows/clears the visible error and ARIA state.
  function validateField(name, show) {
    const field = FIELDS[name];
    let message = firstError(name);

    field.elements.forEach((el) => el.setCustomValidity(message));
    if (!message) {
      const nativeFail = field.elements.find((el) => !el.checkValidity());
      if (nativeFail) message = nativeFail.validationMessage;
    }

    if (show) {
      byId(name + "_err").textContent = message;
      const invalid = String(message !== "");
      field.elements.forEach((el) => el.setAttribute("aria-invalid", invalid));
      if (field.group) field.group.setAttribute("aria-invalid", invalid);
      if (!summary.hidden) refreshSummary();
    }
    return message;
  }

  function isShowingError(name) {
    return byId(name + "_err").textContent !== "";
  }

  /* ---------- Error summary ---------- */

  function showSummary(names) {
    summaryNames = names.slice();
    renderSummary();
    summary.hidden = false;
    replay(summary, "pop");
    nudge(names);
    summary.focus();
  }

  function refreshSummary() {
    summaryNames = summaryNames.filter((n) => firstError(n) !== "" || isShowingError(n));
    if (summaryNames.length === 0) { summary.hidden = true; return; }
    renderSummary();
  }

  function renderSummary() {
    summary.replaceChildren();
    const heading = document.createElement("h2");
    heading.id = "error-summary-title";
    heading.textContent = summaryNames.length === 1
      ? "There is 1 problem to fix"
      : "There are " + summaryNames.length + " problems to fix";
    const list = document.createElement("ul");
    summaryNames.forEach((name) => {
      const field = FIELDS[name];
      const target = field.elements[0];
      const link = document.createElement("a");
      link.href = "#" + target.id;
      link.textContent = byId(name + "_err").textContent || firstError(name);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        // Reveal the section first; a hidden field cannot take focus.
        showStep(field.step, { keepSummary: true, focusHeading: false });
        const focusEl = field.elements.find((el) => el.checked) || target;
        focusEl.focus();
      });
      const item = document.createElement("li");
      item.appendChild(link);
      list.appendChild(item);
    });
    summary.append(heading, list);
  }

  /* ---------- Navigation ---------- */

  function showStep(index, opts) {
    const options = Object.assign({ keepSummary: false, focusHeading: true }, opts);
    currentStep = index;
    if (index !== 3) clearStatus();
    // Slide direction: forward steps enter from the right, Back from the left.
    const direction = index >= previousStep ? "enter-forward" : "enter-back";
    previousStep = index;
    sections[index].classList.remove("enter-forward", "enter-back");
    void sections[index].offsetWidth;
    sections[index].classList.add(direction);
    byId("progressFill").style.width = (index / 3) * 100 + "%";
    // Sections are only shown/hidden; inputs are never recreated, so Back keeps values.
    sections.forEach((section, i) => section.classList.toggle("active", i === index));
    document.querySelectorAll("[data-step-label]").forEach((li, i) => {
      li.classList.toggle("current", i === index);
      li.classList.toggle("done", i < index);
    });
    byId("stepNum").textContent = index + 1;
    byId("stepName").textContent = STEP_NAMES[index];
    form.querySelectorAll("[data-return]").forEach((b) => { b.hidden = !returnToReview; });
    if (index === 3) returnToReview = false;
    if (!options.keepSummary) summary.hidden = true;
    if (options.focusHeading) sections[index].querySelector("h2").focus();
  }

  function namesInStep(step) {
    return FIELD_NAMES.filter((n) => FIELDS[n].step === step);
  }

  // Validate a list of fields with visible errors; returns the invalid ones.
  function sweep(names) {
    return names.filter((n) => validateField(n, true) !== "");
  }

  function goNext() {
    if (currentStep === 2) { returnToReviewStep(); return; }
    const invalid = sweep(namesInStep(currentStep));
    if (invalid.length) { showSummary(invalid); return; }
    showStep(currentStep + 1);
  }

  // Back can leave an invalid section behind during an edit.
  function validateAllSteps() {
    const invalid = sweep(FIELD_NAMES);
    if (!invalid.length) return true;
    clearStatus();
    showStep(FIELDS[invalid[0]].step, { keepSummary: true, focusHeading: false });
    showSummary(invalid);
    return false;
  }

  function returnToReviewStep() {
    if (!validateAllSteps()) return;
    buildReview();
    showStep(3);
  }

  /* ---------- Review (non-secret values only, built with textContent) ---------- */

  function buildReview() {
    const review = byId("reviewSummary");
    review.replaceChildren();
    const bio = FIELDS.bio.value();
    const groups = [
      ["Identity", 0, [
        ["Full name", FIELDS.fullname.value()],
        ["Campus email", FIELDS.campusEmail.value()],
        ["Student ID", FIELDS.studentId.value()]
      ]],
      ["Security", 1, [
        // Only an indicator: the password and confirmation are never displayed.
        ["Practice password", FIELDS.password.value() ? "Set (hidden)" : "Not set"]
      ]],
      ["Profile", 2, [
        ["Membership tier", FIELDS.tier.value() || "Not chosen"],
        ["Interests", FIELDS.interests.value().join(", ") || "None"],
        ["Bio", bio ? bio : "(left blank)"],
        ["Terms", FIELDS.terms.value() ? "Accepted" : "Not accepted"]
      ]]
    ];
    groups.forEach(([title, step, rows]) => {
      const h = document.createElement("h3");
      h.textContent = title;
      const dl = document.createElement("dl");
      rows.forEach(([k, v], i) => {
        const dt = document.createElement("dt"); dt.textContent = k;
        const dd = document.createElement("dd"); dd.textContent = v;
        dt.style.setProperty("--i", i); dd.style.setProperty("--i", i);   // stagger delay
        dl.append(dt, dd);
      });
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit " + title;
      edit.addEventListener("click", () => {
        returnToReview = true;
        clearStatus();
        showStep(step);
      });
      review.append(h, dl, edit);
    });
  }

  /* ---------- Live helpers: password checklist, interests count, bio counter ---------- */

  let lastMetCount = -1;
  function updatePasswordChecklist() {
    const v = FIELDS.password.value();
    let met = 0;
    byId("pwRules").querySelectorAll("li").forEach((li) => {
      const ok = PASSWORD_CHECKS[li.dataset.rule](v);
      if (ok) met++;
      if (ok && !li.classList.contains("met")) replay(li, "just-met");
      li.classList.toggle("met", ok);
      li.querySelector(".mark").textContent = ok ? "✓" : "✗";
      li.querySelector(".state").textContent = ok ? "(Met)" : "(Needed)";
    });
    const meter = byId("pwMeter");
    meter.dataset.level = met;
    meter.querySelectorAll("span").forEach((seg, i) => seg.classList.toggle("on", i < met));
    // Announce only when the count changes, not on every keystroke.
    if (met !== lastMetCount) {
      byId("pwStatus").textContent = met + " of 5 password requirements met.";
      lastMetCount = met;
    }
  }

  function updateInterestCount() {
    byId("interests_count").textContent = FIELDS.interests.value().length + " of 3 selected";
  }

  function updateBioCounter() {
    const used = FIELDS.bio.value().length;
    const left = 140 - used;
    const fill = byId("bioFill");
    fill.style.width = Math.min(100, (used / 140) * 100) + "%";
    fill.classList.toggle("warn", left <= 20);
    fill.classList.toggle("over", left < 0);
    byId("bioCount").textContent = left >= 0
      ? left + " characters left"
      : -left + " characters over the 140 limit";
  }

  /* ---------- Event wiring (Module 6 timing) ---------- */

  // input/change: clear or update an error as soon as the user fixes it.
  function onEdit(event) {
    const name = fieldOf.get(event.target);
    if (!name) return;
    touched.add(name);
    clearStatus();
    if (name === "password") {
      updatePasswordChecklist();
      // If the password changes after a confirmation was typed, recheck the match.
      if (FIELDS.confirm.value() !== "") validateField("confirm", true);
    }
    if (name === "interests") updateInterestCount();
    if (name === "bio") updateBioCounter();

    const tooMany = name === "interests" && FIELDS.interests.value().length > 3;
    const overLimit = name === "bio" && FIELDS.bio.value().length > 140;
    const instant = name === "tier" || name === "terms";   // a click is a complete answer
    if (isShowingError(name) || tooMany || overLimit || instant) validateField(name, true);
  }
  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);

  // blur: check the field once the user leaves it. An untouched empty field is
  // skipped so tabbing through the form does not fill it with "required" errors;
  // those are still caught by Next and the final submit sweep.
  form.addEventListener("focusout", (event) => {
    const name = fieldOf.get(event.target);
    if (!name) return;
    if (name === "tier" && tierRadios.includes(event.relatedTarget)) return; // moving within the group
    const value = FIELDS[name].value();
    const hasValue = value !== "" && value !== false && !(Array.isArray(value) && value.length === 0);
    if (touched.has(name) || hasValue || isShowingError(name)) validateField(name, true);
  });

  // A mouse press on a nav button would blur the current field first; the blur
  // check can insert an error message, push the button down, and make the click
  // miss. Keeping focus in place until the click avoids that layout jump. The
  // click handler still validates, and keyboard users are unaffected.
  form.addEventListener("mousedown", (event) => {
    if (event.target.closest(".nav button")) event.preventDefault();
  });

  form.addEventListener("click", (event) => {
    if (event.target.closest("[data-back]")) showStep(Math.max(0, currentStep - 1)); // Back never blocks
    else if (event.target.closest("[data-next]")) goNext();
    else if (event.target.closest("[data-return]")) returnToReviewStep();
  });

  // submit: Enter inside steps 1-3 behaves like Next; on Review it runs the full sweep.
  form.addEventListener("submit", (event) => {
    event.preventDefault();                       // no data ever leaves the page
    if (currentStep < 3) { goNext(); return; }

    // Full re-validation: values may have changed (or been tampered with) since
    // each step was checked, so earlier "Next" results are not trusted.
    if (!validateAllSteps()) return;
    buildReview();
    status.textContent = "Registration checked: every rule passed. Nothing was sent or saved, because this is a client-only practice form.";
    celebrate();
  });

  /* ---------- Success celebration (decorative) ---------- */

  function celebrate() {
    byId("successName").textContent = FIELDS.fullname.value().trim().split(/\s+/)[0];
    successCard.hidden = false;
    replay(successCard, "show");
    // Scroll only; focus stays on Submit so keyboard position is not lost.
    successCard.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest" });
    if (!reduceMotion.matches) confetti();
  }

  // Lightweight canvas confetti: ~150 pieces, about 3 seconds, then it clears
  // itself. No library, nothing stored, and the canvas ignores pointer events.
  function confetti() {
    const canvas = byId("confetti");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ["#3459be", "#0b7a75", "#f2a900", "#d94f70", "#7b5cd6"];
    const pieces = Array.from({ length: 150 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 13 - 4,
      size: 5 + Math.random() * 6,
      spin: Math.random() * Math.PI,
      vspin: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    const start = performance.now();
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      pieces.forEach((p) => {
        p.vy += 0.35;            // gravity
        p.vx *= 0.99;            // air drag
        p.x += p.vx; p.y += p.vy; p.spin += p.vspin;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 3000);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      });
      if (t < 3000) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
    requestAnimationFrame(frame);
  }

  updatePasswordChecklist();
  updateInterestCount();
  updateBioCounter();
  showStep(0, { focusHeading: false });
})();
