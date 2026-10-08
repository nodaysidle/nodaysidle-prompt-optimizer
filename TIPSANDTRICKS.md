# Prompt Optimizer — Tips, Tricks & Golden Prompt Engineering Rules

> A practitioner's field guide for mastering modern Image & Video Foundation Models (**Google Veo 3.1**, **Google Omni 1.1**, **Kling 1.5/2.0**, **Runway Gen-3 Alpha**, **Midjourney v6.1**, and **Flux.1**).

---

## 1. Subject Identity Lock & Reference Photos

When providing a reference photo to maintain a subject's real face and proportions across AI image and video generators, **never use generic phrases** like *"a picture of the person from before"*.

### The Golden Rule
Start your prompt draft with:
```text
The subject in the photo...
```
*(or click the **`+ Reference Photo Lock`** chip in the optimizer)*.

### The Exact Production Output
The prompt optimizer strictly maps this into the identity lock standard:
```text
Use photo in the attachment as only reference. Identity lock: exact likeness, facial geometry / proportions.
```

### Why This Works
* **Midjourney v6.1 & Flux.1:** Tells the vision encoder that the attached image is a strict identity key, preventing the model from hallucinating a stylized generic face.
* **Veo 3.1 & Kling:** Preserves cranial proportions, eye distance, and cheekbone geometry across camera turns and dynamic lighting.

---

## 2. Speech, Dialogue & Lip-Sync in Video Models

When you want a character in a video generator (especially **Google Omni 1.1**, **Kling**, or **Runway Gen-3**) to speak, **avoid colloquial shortcuts** like:
> ❌ *The subject says in Italian language with lipsync "Ciao Mondo!"*

### Why Shortcuts Fail
1. **Text Hallucination (The Subtitle Bug):** Video models frequently print the words `"Ciao Mondo!"` onto the screen as floating subtitles, watermark text, or cartoon bubbles instead of animating speech.
2. **Static Lips:** If you say "says" without describing physical anatomy, the audio may play while the character's mouth remains completely closed or twitches unnaturally.

### The Proven 2-Part Formula
Always split **physical articulation** from **spoken dialogue and audio**:

```text
[SUBJECT ACTION & LIP MOVEMENT]: The subject looks directly into the camera lens with a subtle warm smile. Lips and mouth move with natural, expressive articulation corresponding to the spoken words, accompanied by natural jaw motion, realistic eye blinks, and subtle head nodding. No subtitles, no captions, no on-screen text overlays.

[DIALOGUE & SPEECH]: Speaks clearly in authentic Italian: "Ciao Mondo!" with a friendly, natural conversational cadence and clear Italian pronunciation.
```

### Golden Speech Checklist
* [x] **Add an explicit anti-subtitle guard:** `No subtitles, no captions, no on-screen text.`
* [x] **Describe physical mechanics:** Use `natural lip articulation`, `realistic mouth shaping`, `jaw movement`.
* [x] **Specify delivery & emotion:** Mention `warm conversational tone`, `authentic pronunciation`, `clear projection`.

---

## 3. Google Veo 3.1 vs. Google Omni 1.1

A common question: *Can I use a Veo 3.1 prompt for Google Omni 1.1?*

**Yes, 100%.** Both models share Google DeepMind's multimodal video foundation architecture and interpret cinematic prompt tags identically.

| Feature | Google Veo 3.1 | Google Omni 1.1 |
|---|---|---|
| **Primary Focus** | Pure visual cinematography & physical kinematics | Omni-modal (Audiovisual + speech + real-time interaction) |
| **Temporal Pacing (`0-2s`, `2-5s`)** | Supported & recommended | Supported & recommended |
| **Camera Movements (Pan, Crane, FPV)** | Supported & recommended | Supported & recommended |
| **Identity Lock Syntax** | Supported | Supported |
| **Native Audio / SFX Generation** | Separate or ignored | **Natively synthesized from prompt** |

### How to adapt a Veo prompt for Omni
Simply append an audio tag to your Veo prompt:
```text
[AUDIO & SFX]: High-RPM motorcycle engine roar echoing off ancient stone buildings, tires screeching across cobblestones, distant crowd cheering with natural spatial acoustics.
```

---

## 4. Engine-Specific Dialects

Select the appropriate engine chip in the optimizer to automatically tune syntax:

### Midjourney v6.1
* **Format:** Comma-separated visual cues, camera lens specifications, lighting, and parameters.
* **Key parameters:** Append `--v 6.1 --style raw --ar 16:9` at the very end.
* **Rule:** Prune conversational filler words (*"Please generate a photorealistic..."*).

### Flux.1 / Google Nano Banana
* **Format:** Dense, sensory, descriptive paragraphs.
* **Strength:** Excels at skin micro-textures, fabric weaves, atmospheric fog, and volumetric light falloff.
* **Rule:** Use full natural sentences rather than disconnected keyword tags.

### Kling 1.5 / 2.0
* **Format:** High-motion action with realistic physical contact mechanics.
* **Strength:** Complex character acrobatics, drift physics, vehicle dynamics.
* **Key prompt cues:** Second-by-second speed changes, contact mechanics, secondary dust/smoke particles.

### Runway Gen-3 Alpha
* **Format:** Director-level cinematography.
* **Strength:** Camera crane movements, orbital pans, slow-motion push-ins, and dynamic lighting transitions.
* **Key prompt cues:** Focal lengths (e.g. `24mm anamorphic`), shutter speed, camera elevation.

---

## 5. Negative Prompting Cheat Sheet

Negative prompts tell the generation engine what artifacts and anomalies to strip out before rendering.

### For Still Images (Midjourney `--no`, Flux, Stable Diffusion)
```text
deformed anatomy, extra limbs, bad hands, missing fingers, distorted face, blurry, plastic skin, oversaturated, low quality, artifacts, watermark, logo, text
```

### For Video (Veo 3.1, Omni, Kling, Runway)
```text
static pause, frame stutter, jerky camera movement, limb distortion, rubbery morphing, frame flicker, over-smoothing, synthetic plastic sheen, digital compression artifacts
```

### When Using Identity Lock Reference Photos
Always prepend:
```text
identity mismatch, facial morphing, different person, distorted features, altered facial geometry, 
```

---

## 6. Aspect Ratio & Optics Presets

Use the toolbar directly above the draft textarea in the workspace:

### Aspect Ratios
* **`16:9`** — YouTube, desktop widescreen, cinematic landscape.
* **`9:16`** — TikTok, Instagram Reels, YouTube Shorts, mobile full-screen.
* **`1:1`** — Square feed posts, album covers, icon art.
* **`2.39:1`** — Anamorphic cinema widescreen (panavision look).
* **`4:5`** — Instagram vertical feed portrait.

### Focal Lengths & Camera Angles
* **`35mm Street`** — Natural documentary field of view, realistic street photography perspective.
* **`85mm Portrait`** — Flattering facial compression, creamy bokeh background separation.
* **`24mm Anamorphic`** — Cinematic wide-angle with horizontal lens flares and dramatic distortion.
* **`FPV Low-Angle`** — High-speed ground-level dynamic pursuit shot.
* **`Macro 100mm`** — Ultra-close sensory detail (dew drops, skin pores, fabric textures).

---

## 7. Workflow Shortcut in NODAYSIDLE Prompt Optimizer

1. Select **Image** or **Video**.
2. Click target engine: **Midjourney**, **Flux**, **Veo**, or **Kling**.
3. Click **`+ Reference Photo Lock`** if attaching a face/subject image.
4. Click **Aspect Ratio** and **Optics** pills to snap framing presets into your draft.
5. Click **Optimize** (~$0.001 via DeepSeek Flash).
6. Copy both the **Optimized Prompt** and **Negative Prompt** into your generation tool.
7. Access past winning prompts anytime in **History & Saved**.
