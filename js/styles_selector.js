import { app } from "/scripts/app.js";

app.registerExtension({
    name: "agi.CustomStylesSelector.Extension",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "CustomStylesSelector") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                
                const node = this;
                node.previewImage = null;
                node.previewImageLoaded = false;
                node.debugStatus = "Initializing...";
                node.attemptedPath = "";
                
                node.currentStyleName = "None";
                node.currentPositiveText = "";
                node.currentNegativeText = "";
                node.detectedLoraNames = []; 
                
                node.currentCommentText = "";
                node.currentSeedValue = "None";
                node.currentSourceFile = "None"; // <-- ADDED: Track current style file source
                node.seedCopyFeedback = false;
                
                node.size = [350, 355]; // <-- ADJUSTED: Extra 15px height cushion for bottom file text frame

                function syncStylesData() {
                    let stylesArray = [];
                    try {
                        const rawInventory = nodeData.input?.hidden?.styles_inventory?.[1]?.default;
                        if (rawInventory) {
                            stylesArray = JSON.parse(rawInventory);
                        } else {
                            const hiddenWidget = node.widgets?.find(w => w.name === "styles_inventory");
                            if (hiddenWidget && hiddenWidget.value) {
                                stylesArray = JSON.parse(hiddenWidget.value);
                            }
                        }
                    } catch(e) {
                        console.error("[Styles Selector Backend Sync Error]", e);
                    }

                    const categoryWidget = node.widgets?.find(w => w.name === "select_category");
                    const styleWidget = node.widgets?.find(w => w.name === "select_style");
                    
                    if (!categoryWidget || !styleWidget) return;

                    const filterStylesByCategory = () => {
                        const currentCategory = categoryWidget.value;
                        const filtered = stylesArray.filter(item => item.category === currentCategory);
                        styleWidget.options.values = filtered.map(item => item.name);
                        if (styleWidget.options.values.length === 0) styleWidget.options.values = ["None"];
                        if (!styleWidget.options.values.includes(styleWidget.value)) {
                            styleWidget.value = styleWidget.options.values[0];
                        }
                        updateCanvasThumbnail();
                    };

                    const updateCanvasThumbnail = () => {
                        if (!stylesArray || stylesArray.length === 0) return;

                        const selectedValue = styleWidget.value;
                        node.currentStyleName = selectedValue;
                        const styleConfig = stylesArray.find(item => item.name === selectedValue);
                        
                        if (!styleConfig) {
                            node.previewImage = null;
                            node.previewImageLoaded = false;
                            node.currentPositiveText = "";
                            node.currentNegativeText = "";
                            node.currentCommentText = "";
                            node.currentSeedValue = "None";
                            node.currentSourceFile = "None";
                            node.detectedLoraNames = [];
                            app.canvas.setDirty(true, true);
                            return;
                        }

                        const cleanUIString = (str) => {
                            if (!str) return "";
                            let cleaned = str.replace(/{prompt}/g, "");
                            cleaned = cleaned.replace(/,(?:\s*,)+/g, ",");
                            return cleaned.trim().replace(/^,|,$/g, "").trim();
                        };

                        node.currentPositiveText = cleanUIString(styleConfig.prompt);
                        node.currentNegativeText = cleanUIString(styleConfig.negative_prompt);
                        node.currentSourceFile = styleConfig.file_name || "Unknown.json"; // <-- ADDED: Update filename
                        
                        // COMPACT DYNAMIC PARAMS PARSER LOOP
                        let formattedParams = "";
                        if (styleConfig.params && typeof styleConfig.params === 'object') {
                            const p = styleConfig.params;
                            let parts = [];
                            
                            Object.entries(p).forEach(([key, value]) => {
                                if (key !== "seed" && value !== undefined && value !== null) {
                                    parts.push(`${key}:${value}`);
                                }
                            });
                            
                            formattedParams = parts.join(",");
                        }

                        // SEED RECOVERY ENGINE FALLBACK
                        let targetSeed = styleConfig.seed;
                        if (targetSeed === undefined || targetSeed === null || targetSeed === "") {
                            targetSeed = styleConfig.params?.seed;
                        }
                        node.currentSeedValue = (targetSeed !== undefined && targetSeed !== null && targetSeed !== "") ? String(targetSeed) : "None";

                        node.detectedLoraNames = [];
                        const rawCombinedText = `${styleConfig.prompt || ""} ${styleConfig.negative_prompt || ""}`;
                        const loraRegex = /<lora:([^:]+)(?::[^>]+)?>/g;
                        const embedRegex = /[^a-zA-Z0-9_-]?embedding:([a-zA-Z0-9_.-]+)/g;
                        let match;
                        while ((match = loraRegex.exec(rawCombinedText)) !== null) {
                            if (match[1]) node.detectedLoraNames.push({ type: "lora", text: `LoRa: ${match[1]}` });
                        }
                        while ((match = embedRegex.exec(rawCombinedText)) !== null) {
                            if (match[1]) node.detectedLoraNames.push({ type: "embed", text: `Emb: ${match[1]}` });
                        }

                        if (styleConfig.name && styleConfig.name.includes("⚠️ ERROR IN")) {
                            node.previewImage = null;
                            node.previewImageLoaded = false;
                            node.debugStatus = "JSON Syntax Error Block";
                            node.attemptedPath = "";
                            node.currentCommentText = styleConfig.comment || "None";
                            app.canvas.setDirty(true, true);
                            return;
                        }

                        if (styleConfig.thumbnail) {
                            // Point browser to mapped endpoint route
                            node.attemptedPath = `/agi_styles_thumbnails/${styleConfig.thumbnail}`;
                            
                            // Expected local project relative fallback path configuration string
                            const expectedLocalPath = `easy_styles/thumbnails/${styleConfig.thumbnail}`;
                            
                            const img = new Image();
                            img.src = `${node.attemptedPath}?t=${Date.now()}`;
                            
                            img.onload = () => {
                                node.previewImage = img;
                                node.previewImageLoaded = true;
                                
                                let baseComment = styleConfig.comment || "";
                                node.currentCommentText = formattedParams 
                                    ? (baseComment ? `${baseComment}|${formattedParams}` : formattedParams)
                                    : (baseComment || "None");
                                app.canvas.setDirty(true, true);
                            };
                            
                            img.onerror = () => {
                                node.previewImage = null;
                                node.previewImageLoaded = false;
                                node.debugStatus = "Image 404 Missing";
                                // MODIFIED: Outputs local directory architecture fallback context instead of system runtime URI
                                node.currentCommentText = `[ERR: Missing Thumbnail File] Place image here: ${expectedLocalPath}`;
                                app.canvas.setDirty(true, true);
                            };
                        } else {
                            node.previewImage = null;
                            node.previewImageLoaded = false;
                            node.debugStatus = "No thumbnail set";
                            node.attemptedPath = "";
                            node.currentCommentText = `[WARN: No thumbnail configuration set in JSON]`;
                            app.canvas.setDirty(true, true);
                        }
                    };

                    categoryWidget.callback = filterStylesByCategory;
                    styleWidget.callback = updateCanvasThumbnail;
                    filterStylesByCategory();
                }

                setTimeout(syncStylesData, 100);
            };

            nodeType.prototype.onMouseDown = function (e, local_pos) {
                // Adjusted bound checks slightly due to frame shift down
                if (local_pos[1] >= 270 && local_pos[1] <= 330 && local_pos[0] >= 210) {
                    if (this.currentSeedValue && this.currentSeedValue !== "None" && this.currentSeedValue !== "ERROR") {
                        navigator.clipboard.writeText(this.currentSeedValue);
                        this.seedCopyFeedback = true;
                        app.canvas.setDirty(true);
                        setTimeout(() => { this.seedCopyFeedback = false; app.canvas.setDirty(true); }, 1200);
                        return true; 
                    }
                }
            };

            nodeType.prototype.computeSize = function() { return [350, 355]; };

            nodeType.prototype.onDrawBackground = function(ctx) {
                if (this.flags.collapsed) return;
                
                const startY = 150; 
                const padding = 14;
                const thumbSize = 110; 
                const textStartX = padding + thumbSize + 20; 
                const maxTextWidth = this.size[0] - textStartX - padding;
                const isJsonError = this.currentStyleName && this.currentStyleName.includes("⚠️ ERROR IN");

                const drawWrappedText = (text, x, y, maxLines = 4, targetWidth = maxTextWidth) => {
                    let lines = [];
                    let currentLine = "";
                    for (let i = 0; i < text.length; i++) {
                        let testLine = currentLine + text[i];
                        if (ctx.measureText(testLine).width > targetWidth) {
                            lines.push(currentLine);
                            currentLine = text[i];
                        } else { currentLine = testLine; }
                        if (lines.length === maxLines) break;
                    }
                    if (lines.length < maxLines) lines.push(currentLine);
                    lines.forEach((line, j) => {
                        ctx.fillText(line, x, y + (j * 8.2));
                    });
                    return y + (lines.length * 8.2);
                };

                ctx.save();
                
                // Outer Base Frame
                ctx.fillStyle = "#1e1e24";
                ctx.beginPath();
                ctx.roundRect(padding - 3, startY - 3, thumbSize + 6, thumbSize + 6, 8);
                ctx.fill();
                
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = isJsonError ? "#ff3333" : (this.previewImageLoaded ? "#3cd3ff" : "#d85a20");
                ctx.stroke();

                ctx.fillStyle = "#0d0d11";
                ctx.beginPath();
                ctx.roundRect(padding, startY, thumbSize, thumbSize, 5);
                ctx.fill();

                if (this.previewImageLoaded && this.previewImage) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(padding, startY, thumbSize, thumbSize, 5);
                    ctx.clip();
                    ctx.drawImage(this.previewImage, padding, startY, thumbSize, thumbSize);
                    ctx.restore();
                } else {
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = isJsonError ? "rgba(255, 51, 51, 0.4)" : "rgba(216, 90, 32, 0.25)";
                    ctx.beginPath();
                    ctx.moveTo(padding, startY); ctx.lineTo(padding + thumbSize, startY + thumbSize);
                    ctx.moveTo(padding + thumbSize, startY); ctx.lineTo(padding, startY + thumbSize);
                    ctx.stroke();
                }

                ctx.fillStyle = isJsonError ? "#ff3333" : (this.previewImageLoaded ? "#3cd3ff" : "#ff7c43");
                ctx.font = "bold 11px sans-serif";
                ctx.fillText(String(this.currentStyleName).split(" / ").pop().toUpperCase(), textStartX, startY + 10);
                
                ctx.font = "7px sans-serif";
                let currentY = startY + 21; 
                ctx.fillStyle = isJsonError ? "#ff7777" : "#a3e26c";
                ctx.fillText(isJsonError ? "File Alert Info:" : "Positive:", textStartX, currentY);
                currentY = drawWrappedText(this.currentPositiveText || "None", textStartX, currentY + 8.2, 4) + 2;

                ctx.fillStyle = isJsonError ? "#ff7777" : "#f37a7a";
                ctx.fillText(isJsonError ? "Action Required:" : "Negative:", textStartX, currentY);
                currentY = drawWrappedText(this.currentNegativeText || "None", textStartX, currentY + 8.2, 4);

                if (!isJsonError && this.detectedLoraNames && this.detectedLoraNames.length > 0) {
                    ctx.fillStyle = "#e2b16c"; 
                    ctx.fillText("Dependencies:", textStartX, currentY + 2);
                    currentY += 10.2;
                    for (let k = 0; k < Math.min(this.detectedLoraNames.length, 2); k++) {
                        const item = this.detectedLoraNames[k];
                        ctx.fillStyle = (item.type === "embed") ? "#a3e26c" : "#ffd8a8";
                        ctx.fillText(item.text, textStartX + 4, currentY);
                        currentY += 8.2;
                    }
                }

                // Metadata Frame Deck
                const metadataTopY = 272;
                ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
                ctx.beginPath();
                ctx.roundRect(padding, metadataTopY, this.size[0] - (padding * 2), 65, 4); // <-- EXPANDED: Changed height from 52 to 65
                ctx.fill();
                
                ctx.font = "7px monospace";
                if (isJsonError) {
                    ctx.fillStyle = "#ff3333";
                    ctx.fillText("CRITICAL JSON SYNTAX EXCEPTION:", padding + 8, metadataTopY + 12);
                } else {
                    ctx.fillStyle = this.previewImageLoaded ? "#9e9eb4" : "#ff5555";
                    ctx.fillText(this.previewImageLoaded ? "COMMENT / PARAMS:" : "DEBUG INFO (IMAGE NOT FOUND):", padding + 8, metadataTopY + 12);
                }
                
                ctx.fillStyle = "#ffffff";
                const hasValidSeed = (!isJsonError && this.currentSeedValue && this.currentSeedValue !== "None");
                drawWrappedText(this.currentCommentText || "None", padding + 8, metadataTopY + 22, 3, hasValidSeed ? 180 : 310);
                
                // Dynamic Seed UI Frame Component
                if (hasValidSeed) {
                    const seedX = padding + 202;
                    ctx.fillStyle = "#ffcc00";
                    ctx.font = "7px monospace";
                    ctx.fillText("SEED (CLICK TO COPY):", seedX, metadataTopY + 12);
                    
                    if (this.seedCopyFeedback) {
                        ctx.fillStyle = "#a3e26c";
                        ctx.font = "bold 8px sans-serif";
                        ctx.fillText("✓ COPIED!", seedX, metadataTopY + 24);
                    } else {
                        ctx.fillStyle = "#3cd3ff";
                        ctx.font = "7px monospace";
                        ctx.fillText(this.currentSeedValue, seedX, metadataTopY + 24);
                    }
                }

                // ADDED: Bottom .json Filename Footnote inside the panel deck
                ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padding + 6, metadataTopY + 51);
                ctx.lineTo(this.size[0] - padding - 6, metadataTopY + 51);
                ctx.stroke();

                ctx.fillStyle = isJsonError ? "#ff5555" : "#777788";
                ctx.font = "italic 7px sans-serif";
                ctx.fillText(`Source Configuration: easy_styles/${this.currentSourceFile}`, padding + 8, metadataTopY + 60);
                
                ctx.restore();
            };
        }
    }
});
