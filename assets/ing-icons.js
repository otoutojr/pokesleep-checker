/* Ingredient icons in the ingredient row of a Pokémon Sleep detail screenshot.
 * Each ingredient is kept as an 8x8 layout of mean colours (premultiplied) and coverage, measured from
 * the game's icons. A slot's icon is that sprite over the slot's pale circle: as is when the slot is
 * unlocked, faded to about 40% when it is still locked. Every ingredient is fitted (position, size,
 * fade) and the fit errors tell them apart. The count on each badge ("x4") is read by matching the badge
 * font's glyphs. Exposes window.IngIcons = { findRow, score, readCount }. */
(function () {
  'use strict';
  const N = 8;
  const DATA = {"apple":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,5,2,21,85,73,29,156,109,111,40,202,85,55,26,159,20,9,4,39,0,0,0,0,0,0,0,0,0,0,0,0,25,12,6,50,139,65,26,249,156,60,20,255,134,55,31,255,123,34,17,187,13,6,3,25,0,0,0,0,0,0,0,0,73,25,12,115,244,61,41,255,246,60,40,255,236,44,28,255,244,52,33,255,116,33,17,163,0,0,0,0,0,0,0,0,106,30,16,150,241,43,25,255,241,43,25,255,241,43,25,255,240,42,24,255,143,33,17,194,0,0,0,0,0,0,0,0,54,20,10,93,223,36,19,255,230,35,19,255,228,44,19,255,218,29,13,255,85,24,12,135,0,0,0,0,0,0,0,0,2,1,0,3,104,41,16,159,199,74,28,254,203,84,34,255,136,56,22,196,9,4,2,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7,3,2,14,7,3,1,14,0,0,0,0,0,0,0,0,0,0,0,0],"avocado":[0,0,0,0,0,0,0,0,36,20,7,61,55,45,13,105,23,10,4,36,12,5,2,18,0,0,0,0,0,0,0,0,0,0,0,0,48,34,11,88,77,143,27,255,86,116,20,255,133,149,35,250,188,134,54,248,12,5,2,18,0,0,0,0,0,0,0,0,77,79,20,174,140,115,30,253,202,215,58,255,200,234,55,255,198,218,47,255,65,47,13,96,0,0,0,0,0,0,0,0,63,33,11,96,210,227,67,254,202,237,47,255,196,234,43,255,170,222,41,255,74,70,18,134,0,0,0,0,0,0,0,0,68,57,15,115,194,235,68,255,201,239,71,255,174,224,42,255,169,221,48,255,77,72,23,136,0,0,0,0,0,0,0,0,45,27,9,71,127,186,38,255,174,223,60,255,185,228,82,255,139,191,63,255,47,28,12,71,0,0,0,0,0,0,0,0,51,39,17,60,101,82,27,161,117,137,31,235,120,143,32,241,101,80,26,158,59,46,20,70,0,0,0,0,0,0,0,0,9,7,3,10,32,25,11,38,42,32,14,50,42,33,14,50,34,26,12,40,12,9,4,14,0,0,0,0],"cacao":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7,3,1,13,72,37,14,115,108,57,20,156,106,45,18,193,1,1,0,3,0,0,0,0,0,0,0,0,9,4,2,19,160,90,31,216,238,151,53,255,235,140,43,255,157,103,28,255,70,56,17,172,0,0,0,0,0,0,0,0,90,48,18,135,234,140,44,255,240,148,47,255,230,134,43,255,174,107,32,255,74,105,20,255,20,9,4,39,0,0,0,0,141,76,28,192,236,142,46,255,221,121,41,255,227,128,46,255,144,96,27,255,69,92,15,255,15,7,3,29,0,0,0,0,128,67,26,178,220,116,41,255,220,117,41,255,191,95,38,252,61,28,12,110,46,23,10,95,2,1,0,4,0,0,0,0,55,26,11,93,110,52,21,170,84,39,16,137,25,12,5,49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"coffee":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,3,2,15,80,47,27,126,59,34,20,97,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,86,48,27,138,225,175,120,255,220,167,114,255,47,24,12,82,0,0,0,0,0,0,0,0,0,0,0,0,70,40,23,112,153,94,56,233,206,145,92,255,213,157,105,255,146,83,46,231,113,61,32,186,2,1,0,3,21,9,5,41,207,152,101,254,218,166,112,255,167,98,54,255,148,79,44,252,190,131,85,255,177,116,73,255,18,8,4,36,19,9,4,38,176,116,71,245,186,118,68,255,150,84,44,252,154,92,55,245,197,141,95,255,172,108,66,255,28,13,6,55,0,0,0,0,17,8,4,33,28,13,6,55,13,6,3,25,44,21,11,82,87,45,24,153,46,22,11,86,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"corn":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1,1,3,15,8,4,24,4,2,1,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,1,1,4,84,50,17,116,224,184,121,255,88,52,30,127,0,0,0,0,0,0,0,0,24,12,6,39,90,73,18,171,157,114,26,189,252,225,59,255,228,174,43,252,18,9,4,29,0,0,0,0,0,0,0,0,64,58,16,109,138,163,31,247,250,217,37,255,253,219,40,255,218,154,27,245,4,2,1,5,0,0,0,0,4,2,1,6,113,96,26,193,118,188,32,255,209,209,30,255,253,203,26,255,166,164,23,255,107,87,23,188,3,2,1,5,0,0,0,0,82,91,19,159,125,199,36,255,213,197,22,255,207,162,16,252,52,36,11,86,0,0,0,0,0,0,0,0,0,0,0,0,43,30,9,79,120,160,31,255,111,150,22,255,63,59,13,125,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,9,5,29,15,7,4,24,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"egg":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,3,1,13,98,74,59,141,105,80,64,148,7,3,2,15,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,110,83,66,157,254,253,234,255,254,254,231,255,111,84,66,158,0,0,0,0,0,0,0,0,0,0,0,0,3,1,1,6,205,182,157,245,255,255,233,255,255,254,230,255,208,183,154,247,5,2,1,9,0,0,0,0,0,0,0,0,14,6,3,27,225,208,180,255,255,254,227,255,254,250,221,255,228,204,169,255,18,8,4,35,0,0,0,0,0,0,0,0,1,0,0,2,179,147,117,226,252,240,204,255,250,234,195,255,191,152,113,238,4,2,1,8,0,0,0,0,0,0,0,0,0,0,0,0,27,14,8,49,125,91,63,170,129,95,65,174,35,19,11,61,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"ginger":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,15,7,3,29,0,0,0,0,0,0,0,0,0,0,0,0,6,3,1,13,72,41,18,113,30,14,7,55,158,103,44,213,224,165,74,255,78,47,21,118,0,0,0,0,0,0,0,0,99,63,30,143,248,189,83,255,185,113,46,252,248,189,84,255,248,186,79,255,81,46,20,125,0,0,0,0,0,0,0,0,67,39,18,106,243,185,85,255,244,184,84,255,249,188,83,255,211,137,54,255,55,31,15,94,0,0,0,0,0,0,0,0,67,39,19,106,240,182,86,255,247,191,91,255,243,170,69,255,244,171,67,255,151,96,39,196,0,0,0,0,0,0,0,0,135,90,42,178,248,192,92,255,247,188,88,255,237,180,82,255,123,70,27,178,34,17,8,60,0,0,0,0,0,0,0,0,45,25,12,74,205,140,63,250,193,119,47,243,192,140,65,242,12,6,3,24,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,9,4,2,18,3,1,1,5,10,4,2,19,0,0,0,0,0,0,0,0,0,0,0,0],"herb":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1,1,5,1,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,13,9,56,164,60,60,226,201,52,64,247,115,39,29,196,0,0,0,0,0,0,0,0,87,29,21,139,63,26,15,112,156,54,56,209,234,69,89,255,219,47,65,255,74,29,18,135,0,0,0,0,0,0,0,0,152,35,39,199,207,41,63,255,205,79,67,255,217,38,53,255,219,38,60,254,46,17,11,81,0,0,0,0,0,0,0,0,149,39,38,215,190,93,65,255,198,96,65,255,194,67,70,255,169,54,56,228,62,22,15,103,0,0,0,0,0,0,0,0,65,24,15,112,215,167,90,255,209,113,80,255,221,53,66,255,203,42,51,254,82,25,20,126,0,0,0,0,0,0,0,0,63,36,18,106,155,110,58,208,106,31,27,155,123,34,33,179,60,21,15,102,0,0,0,0,0,0,0,0,0,0,0,0,5,2,1,9,13,6,3,26,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"honey":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,39,25,16,78,70,70,61,139,70,70,61,139,40,25,17,79,0,0,0,0,0,0,0,0,0,0,0,0,26,12,6,51,120,197,193,255,205,222,156,255,207,222,155,255,117,200,196,255,29,13,6,58,0,0,0,0,0,0,0,0,46,27,17,80,173,189,124,255,139,196,146,255,137,195,146,255,168,177,104,255,48,27,14,83,0,0,0,0,0,0,0,0,112,88,65,152,255,193,45,255,255,190,35,255,255,191,36,255,255,169,21,255,113,82,42,153,0,0,0,0,0,0,0,0,63,41,28,102,250,184,63,255,255,177,28,255,255,174,26,255,251,163,36,255,65,40,21,104,0,0,0,0,0,0,0,0,2,1,1,5,107,75,47,152,199,135,57,239,199,131,47,239,108,72,35,154,3,1,1,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"leek":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,65,57,25,165,41,28,12,96,52,55,23,149,74,60,25,187,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,49,55,24,135,52,133,53,255,27,132,49,255,84,65,27,221,5,2,1,11,0,0,0,0,0,0,0,0,1,0,0,1,95,103,45,189,48,172,67,255,32,150,59,255,46,43,18,126,0,0,0,0,0,0,0,0,0,0,0,0,82,55,38,132,230,229,188,255,101,93,42,185,64,63,26,182,37,21,9,80,0,0,0,0,0,0,0,0,55,30,17,100,228,219,185,254,147,116,83,213,6,3,1,13,11,5,2,22,2,1,0,4,0,0,0,0,0,0,0,0,119,69,40,212,150,110,74,238,18,8,4,35,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,5,2,21,16,7,4,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"milk":[0,0,0,0,0,0,0,0,1,1,0,3,28,13,6,54,28,13,6,55,2,1,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,40,18,9,78,141,126,165,255,132,114,153,255,51,28,20,99,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,75,50,37,120,219,207,199,255,196,192,202,255,88,60,45,142,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,177,153,136,219,255,255,239,255,255,255,239,255,185,158,124,228,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,151,130,137,227,235,209,208,255,236,209,208,255,158,136,132,236,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,160,138,138,226,231,206,208,255,232,206,207,255,166,143,130,234,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,152,123,105,202,251,248,225,255,251,247,219,255,158,126,95,209,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7,3,1,13,40,19,10,76,40,19,10,76,6,3,1,13,0,0,0,0,0,0,0,0],"mushroom":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,49,23,8,88,118,55,20,172,136,61,30,188,70,31,15,113,1,0,0,1,0,0,0,0,0,0,0,0,51,23,8,93,185,86,14,255,200,95,14,255,203,95,23,255,207,89,43,255,56,24,12,96,0,0,0,0,0,0,0,0,31,14,6,58,150,70,8,244,168,80,2,255,186,85,15,255,189,87,15,255,114,52,13,181,0,0,0,0,0,0,0,0,0,0,0,0,63,36,21,105,225,172,109,255,178,100,36,255,165,77,4,255,110,47,15,184,0,0,0,0,0,0,0,0,0,0,0,0,119,85,54,160,237,193,129,255,55,25,12,105,56,26,9,106,17,8,4,34,0,0,0,0,0,0,0,0,0,0,0,0,70,44,26,109,206,148,91,252,36,18,9,66,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,3,1,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"oil":[0,0,0,0,0,0,0,0,2,1,0,3,59,43,27,120,56,39,23,119,1,1,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,4,2,19,105,122,83,255,92,107,69,255,9,4,2,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,48,29,19,80,221,202,139,255,210,194,121,254,45,27,16,78,0,0,0,0,0,0,0,0,0,0,0,0,11,5,2,22,199,171,83,249,233,219,63,255,227,215,59,255,181,155,50,248,10,5,2,20,0,0,0,0,0,0,0,0,23,11,5,46,224,211,151,255,233,228,130,255,229,225,124,255,206,196,116,255,21,9,4,40,0,0,0,0,0,0,0,0,23,11,5,46,232,222,199,255,231,234,197,255,226,231,183,255,214,209,153,255,21,9,4,40,0,0,0,0,0,0,0,0,17,8,4,33,205,179,83,254,227,218,95,255,222,215,90,255,189,167,64,254,15,7,3,30,0,0,0,0,0,0,0,0,0,0,0,0,35,19,11,64,90,65,32,137,88,64,31,137,34,18,10,63,0,0,0,0,0,0,0,0],"potato":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,6,3,28,47,24,12,86,62,34,17,104,17,8,4,34,0,0,0,0,0,0,0,0,0,0,0,0,48,27,14,80,213,161,98,250,245,198,124,255,247,200,125,255,218,164,97,253,75,45,25,116,0,0,0,0,3,1,1,6,187,135,80,234,249,204,130,255,248,202,127,255,247,200,124,255,244,191,112,255,205,149,87,248,6,3,1,12,6,3,1,12,203,141,76,249,244,191,112,255,246,195,118,255,247,198,121,255,246,196,119,255,202,140,75,249,7,3,1,13,0,0,0,0,84,46,20,133,227,160,78,255,239,180,98,255,233,165,80,255,221,149,69,255,85,47,21,134,0,0,0,0,0,0,0,0,1,1,0,2,53,27,12,91,111,64,28,160,102,58,25,150,44,22,10,78,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"pumpkin":[0,0,0,0,0,0,0,0,0,0,0,0,11,4,2,16,5,2,1,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,4,2,15,64,32,14,84,136,89,34,193,109,63,23,165,63,28,7,82,11,4,2,16,0,0,0,0,3,1,0,4,181,108,27,205,254,164,27,255,213,144,33,255,203,135,25,255,254,159,17,255,185,108,23,210,4,2,1,6,54,25,8,73,254,180,37,255,255,173,31,255,255,193,68,255,255,182,38,255,255,170,19,255,254,176,25,255,62,29,9,82,57,27,9,77,255,178,26,255,255,170,20,255,255,177,25,255,255,177,25,255,255,170,19,255,255,167,22,255,66,31,9,86,10,4,2,15,224,161,44,242,254,181,34,255,255,192,44,255,255,191,43,255,251,164,22,255,229,145,27,246,14,5,2,21,6,5,2,7,96,62,24,119,174,106,25,201,218,147,36,240,220,144,32,242,175,101,24,202,99,62,23,123,10,7,3,11,0,0,0,0,11,9,4,13,33,26,11,39,43,33,14,51,43,33,15,51,34,26,12,40,13,10,4,15,0,0,0,0],"sausage":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,63,37,24,98,177,109,68,220,166,91,50,223,27,12,6,53,0,0,0,0,0,0,0,0,0,0,0,0,45,23,12,78,230,159,107,253,249,163,104,255,246,146,87,255,119,60,31,167,0,0,0,0,0,0,0,0,19,9,4,37,204,140,93,240,250,187,137,255,247,164,111,255,242,138,80,255,106,50,25,153,0,0,0,0,0,0,0,0,131,78,46,176,251,164,103,255,247,160,101,255,244,152,94,255,194,95,50,241,17,8,4,33,0,0,0,0,0,0,0,0,167,89,49,217,242,138,80,255,243,140,82,255,220,109,58,255,51,23,11,87,0,0,0,0,0,0,0,0,0,0,0,0,64,29,14,110,185,85,41,253,184,87,44,238,62,29,14,101,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1,0,3,1,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"soy":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,4,2,19,141,104,69,187,104,66,38,149,0,0,0,1,0,0,0,0,0,0,0,0,10,4,2,19,126,89,57,172,116,69,40,188,253,223,163,255,234,174,109,255,62,32,17,105,0,0,0,0,1,0,0,1,108,63,38,162,253,217,158,255,210,162,100,255,217,166,102,255,237,201,113,255,188,156,56,253,12,6,3,24,40,20,10,75,208,193,79,255,237,193,112,255,222,218,113,255,250,223,155,255,240,193,115,255,147,93,52,201,2,1,0,3,15,7,3,30,159,104,56,211,144,111,40,215,185,156,57,252,239,176,107,255,255,191,122,255,133,82,48,174,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,5,2,21,56,31,16,94,113,72,43,153,28,14,7,49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"tail":[0,0,0,0,0,0,0,0,1,0,0,1,2,1,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,35,18,13,60,189,132,129,231,207,147,147,246,58,33,26,92,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,156,106,102,197,255,197,211,255,255,197,211,255,161,103,102,204,92,64,52,139,39,23,16,66,0,0,0,0,0,0,0,0,208,146,145,248,255,197,211,255,254,193,207,255,130,80,77,173,112,85,73,157,201,176,162,240,8,4,2,16,0,0,0,0,177,118,117,221,255,197,211,255,254,195,210,255,191,134,135,227,183,158,145,220,235,221,212,255,29,13,6,57,0,0,0,0,69,38,31,110,240,171,184,255,253,192,207,255,254,204,214,255,249,242,236,255,196,168,155,244,8,4,2,16,0,0,0,0,0,0,0,1,72,39,32,114,177,111,112,224,201,130,132,247,153,123,111,204,39,23,16,67,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"tomato":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,24,11,5,47,63,32,16,117,76,41,19,149,27,13,6,54,0,0,0,0,0,0,0,0,0,0,0,0,45,18,11,75,202,75,57,250,124,109,46,255,112,119,46,255,197,80,54,254,66,25,15,103,0,0,0,0,0,0,0,0,153,52,40,194,253,82,76,255,220,73,61,255,214,76,61,255,253,78,72,255,188,61,48,230,0,0,0,1,0,0,0,0,169,67,48,210,255,84,73,255,255,75,70,255,255,87,76,255,255,84,73,255,204,69,53,249,1,1,0,2,0,0,0,0,78,32,19,121,241,70,62,255,251,91,75,255,250,76,68,255,242,69,61,255,112,39,26,162,0,0,0,0,0,0,0,0,1,0,0,2,63,23,14,103,137,40,30,183,143,41,31,189,78,27,17,122,4,2,1,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]};
  const BG = [254, 254, 240];
  const NAMES = Object.keys(DATA);
  const REF = NAMES.map((name) => {
    const f = DATA[name];
    const D = new Float64Array(N * N * 3);
    for (let c = 0; c < N * N; c++) {
      const a = f[c * 4 + 3] / 255;
      for (let k = 0; k < 3; k++) D[c * 3 + k] = f[c * 4 + k] - a * BG[k];
    }
    return D;
  });
  // distance of each cell centre from the sprite centre, in sprite sizes
  const DIST = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) DIST[i * N + j] = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5);

  const isGolden = (d, i) => d[i] > 210 && d[i + 1] > 140 && d[i + 1] < 215 && d[i + 2] < 120 && d[i] - d[i + 2] > 120;
  // small or compressed screenshots wash the thin golden border out
  const isGoldenLoose = (d, i) => d[i] > 195 && d[i + 1] > 120 && d[i + 1] < 228 && d[i + 2] < 175 && d[i] - d[i + 2] > 70;

  // Fit errors (lower = closer) of every ingredient for the icon above a count badge.
  // box: the white inside of the badge, in canvas pixels. Returns { faded, err: { name: error } }.
  function score(canvas, box) {
    const W = canvas.width, H = canvas.height, k = W / 1206;
    const x0 = Math.max(0, Math.floor(box.x0 - 140 * k)), x1 = Math.min(W, Math.ceil(box.x0 + 40 * k));
    const y0 = Math.max(0, Math.floor(box.y0 - 160 * k)), y1 = Math.min(H, Math.ceil(box.y0 + 20 * k));
    const w = x1 - x0, h = y1 - y0;
    if (w < 60 * k || h < 60 * k) return null;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
    // left out: the count badge, and the lock label above the icon
    const mx0 = box.x0 - 14 * k - x0, mx1 = box.x1 + 14 * k - x0, my0 = box.y0 - 14 * k - y0, my1 = box.y1 + 14 * k - y0;
    const top = box.y0 - 115 * k - y0;
    const keep = (x, y) => y >= top && !(x >= mx0 && x <= mx1 && y >= my0 && y <= my1);
    // summed-area tables of r, g, b and of the kept-pixel count
    const W1 = w + 1;
    const S = new Float64Array(W1 * (h + 1) * 4);
    for (let y = 0; y < h; y++) {
      let r = 0, g = 0, b = 0, m = 0;
      for (let x = 0; x < w; x++) {
        if (keep(x, y)) { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; m++; }
        const o = ((y + 1) * W1 + x + 1) * 4, u = (y * W1 + x + 1) * 4;
        S[o] = S[u] + r; S[o + 1] = S[u + 1] + g; S[o + 2] = S[u + 2] + b; S[o + 3] = S[u + 3] + m;
      }
    }
    // locked icons are faded: their darkest pixels (the outline) stay light
    const hist = new Uint32Array(256);
    let total = 0;
    const cx0 = box.x0 - 36 * k - x0, cy0 = box.y0 - 56 * k - y0;
    for (let y = Math.max(0, Math.round(cy0 - 55 * k)); y < Math.min(h, Math.round(cy0 + 50 * k)); y++) {
      for (let x = Math.max(0, Math.round(cx0 - 55 * k)); x < Math.min(w, Math.round(cx0 + 55 * k)); x++) {
        if (!keep(x, y)) continue;
        const i = (y * w + x) * 4;
        hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
        total++;
      }
    }
    let acc = 0, p3 = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.03) { p3 = v; break; } }
    const faded = p3 >= 140 ? true : p3 <= 120 ? false : null;
    const lo = faded === false ? 0.75 : 0.25, hi = faded === true ? 0.6 : 1.15;

    const E = new Float64Array(N * N * 3);
    const valid = new Uint8Array(N * N);
    const cells = (cx, cy, side) => {
      let n = 0;
      for (let i = 0; i < N; i++) {
        const ya = Math.max(0, Math.min(h, Math.round(cy - side / 2 + (i * side) / N) - y0));
        const yb = Math.max(0, Math.min(h, Math.round(cy - side / 2 + ((i + 1) * side) / N) - y0));
        for (let j = 0; j < N; j++) {
          const c = i * N + j;
          const xa = Math.max(0, Math.min(w, Math.round(cx - side / 2 + (j * side) / N) - x0));
          const xb = Math.max(0, Math.min(w, Math.round(cx - side / 2 + ((j + 1) * side) / N) - x0));
          const area = (yb - ya) * (xb - xa);
          valid[c] = 0;
          if (area <= 0 || DIST[c] * side > 0.07 * W) continue;
          const p = (yb * W1 + xb) * 4, q = (ya * W1 + xb) * 4, r = (yb * W1 + xa) * 4, s = (ya * W1 + xa) * 4;
          const m = S[p + 3] - S[q + 3] - S[r + 3] + S[s + 3];
          if (m < 0.8 * area) continue;
          for (let t = 0; t < 3; t++) E[c * 3 + t] = (S[p + t] - S[q + t] - S[r + t] + S[s + t]) / m - BG[t];
          valid[c] = 1;
          n++;
        }
      }
      return n;
    };
    const fit = (D) => {
      let num = 0, den = 0, n = 0;
      for (let c = 0; c < N * N; c++) {
        if (!valid[c]) continue;
        n++;
        for (let t = 0; t < 3; t++) { const v = D[c * 3 + t]; num += v * E[c * 3 + t]; den += v * v; }
      }
      let a = den > 0 ? num / den : lo;
      a = Math.min(hi, Math.max(lo, a));
      let res = 0;
      for (let c = 0; c < N * N; c++) {
        if (!valid[c]) continue;
        for (let t = 0; t < 3; t++) { const v = E[c * 3 + t] - a * D[c * 3 + t]; res += v * v; }
      }
      return res / (3 * n);
    };
    const minCells = 0.4 * N * N;
    const best = REF.map(() => ({ err: Infinity, side: 0, dx: 0, dy: 0 }));
    // coarse search over size and position for all ingredients at once, then refine each one
    for (const s of [128, 136, 144, 152]) {
      for (let dy = -72; dy <= -40; dy += 4) {
        for (let dx = -48; dx <= -24; dx += 4) {
          if (cells(box.x0 + dx * k, box.y0 + dy * k, s * k) < minCells) continue;
          for (let n = 0; n < REF.length; n++) {
            const e = fit(REF[n]);
            if (e < best[n].err) best[n] = { err: e, side: s, dx, dy };
          }
        }
      }
    }
    const err = {};
    for (let n = 0; n < REF.length; n++) {
      const b = best[n];
      if (!isFinite(b.err)) continue;
      let e0 = b.err;
      for (const s of [b.side - 4, b.side, b.side + 4]) {
        for (const dy of [b.dy - 2, b.dy, b.dy + 2]) {
          for (const dx of [b.dx - 2, b.dx, b.dx + 2]) {
            if (cells(box.x0 + dx * k, box.y0 + dy * k, s * k) < minCells) continue;
            const e = fit(REF[n]);
            if (e < e0) e0 = e;
          }
        }
      }
      err[NAMES[n]] = Math.round(e0 * 10) / 10;
    }
    return Object.keys(err).length ? { faded, err } : null;
  }

  // A count badge is a white pill with a golden border and a little dark text inside.
  function looksLikeBadge(d, W, box, loose) {
    let white = 0, dark = 0, n = 0;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const i = (y * W + x) * 4;
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum > (loose ? 225 : 235)) white++; else if (lum < (loose ? 175 : 150)) dark++;
        n++;
      }
    }
    return n > 0 && white / n > 0.45 && dark / n > 0.02 && dark / n < 0.45;
  }

  // The count badges of the ingredient row (Lv1, Lv30, Lv60 slots at about 54%, 71% and 87% of the
  // width), found without any text: [{ slot: 0..2, box }], left to right; [] when not on screen.
  function findRow(canvas, loose) {
    const W = canvas.width, H = canvas.height;
    const golden = loose ? isGoldenLoose : isGolden;
    const yMax = Math.min(H, Math.round(Math.max(0.55 * H, 1.3 * W)));
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, yMax).data;
    const minRun = 0.026 * W, maxRun = 0.065 * W;
    const open = [], bands = [];
    for (let y = 0; y < yMax; y++) {
      let a = -1, b = -1;
      const runs = [];
      for (let x = 0; x < W; x++) {
        if (golden(d, (y * W + x) * 4)) { if (a < 0) a = x; b = x; }
        else if (a >= 0 && x - b > 3) { if (b - a >= minRun && b - a <= maxRun) runs.push([a, b]); a = -1; }
      }
      if (a >= 0 && b - a >= minRun && b - a <= maxRun) runs.push([a, b]);
      for (const [ra, rb] of runs) {
        const band = open.find((t) => y - t.y1 <= 2 && ra <= t.b + 4 && rb >= t.a - 4);
        if (band) { band.y1 = y; band.a = Math.min(band.a, ra); band.b = Math.max(band.b, rb); }
        else { const t = { y0: y, y1: y, a: ra, b: rb }; open.push(t); bands.push(t); }
      }
      for (let i = open.length - 1; i >= 0; i--) if (y - open[i].y1 > 2) open.splice(i, 1);
    }
    const thin = bands.filter((t) => t.y1 - t.y0 <= 0.01 * W);
    const pills = [];
    for (const t of thin) {
      for (const u of thin) {
        const gap = u.y0 - t.y1;
        if (gap < 0.018 * W || gap > 0.045 * W) continue;
        if (Math.abs(t.a - u.a) > 0.02 * W || Math.abs(t.b - u.b) > 0.02 * W) continue;
        const box = { x0: Math.min(t.a, u.a), x1: Math.max(t.b, u.b), y0: t.y1 + 1, y1: u.y0 - 1 };
        if (looksLikeBadge(d, W, box, loose) && !pills.some((p) => Math.abs(p.x0 - box.x0) < 4 && Math.abs(p.y0 - box.y0) < 4)) pills.push(box);
      }
    }
    const SLOT_X = [0.541, 0.709, 0.873];
    const slotOf = (p) => {
      const cx = (p.x0 + p.x1) / 2 / W;
      const i = SLOT_X.findIndex((v) => Math.abs(v - cx) < 0.04);
      return i;
    };
    let bestRow = [];
    for (const p of pills) {
      const row = pills.filter((q) => Math.abs(q.y0 - p.y0) <= 0.012 * W)
        .map((q) => ({ slot: slotOf(q), box: q })).filter((q) => q.slot >= 0);
      const slots = new Set(row.map((q) => q.slot));
      if (slots.size !== row.length) continue;
      const good = row.length >= 2 || (row.length === 1 && row[0].slot > 0);
      if (good && row.length > bestRow.length) bestRow = row;
    }
    if (!bestRow.length && !loose) return findRow(canvas, true);
    return bestRow.sort((a, b) => a.slot - b.slot);
  }


  // Count badge glyphs ("x" and 0-9) as 4-bit ink bitmaps at a 24px digit height, and the glyph positions of
  // "x1" ... "x20", rendered from Montserrat Bold (SIL Open Font License 1.1), which matches the badge font.
  const BADGE_GLYPHS = {"x":[19,17,6,"SqqqEAAAOqqoAL//+QAAHf//MAHv//UACv//YAAE///iB///oAAACP//w///0QAAAAv/////4wAAAAAe////9gAAAAAAT///+QAAAAAAAN///xAAAAAAAD////oAAAAAAB3////2AAAAAAr/////8wAAAAf//7b//9EAAAP//+EK//+gAAHf//QAHf//cAC///gAAE///zCP//sAAACP//0Q"],"0":[19,24,0,"AAAAAAEAAAAAAAAAKN//2TAAAAAAn/////+RAAABv///////sQAAn////////6AAT///xTXP//9AC///sAAAv//8Av//8gAAAv//8m//+wAAAAv//2n//4AAAAB///m///YAAAAF//+7//9QAAAAT//8z//1AAAABP//y///UAAAAF///J//9wAAAAb//6f//6AAAACv//c///4QAAAe//9A3//4AAAH///QBv//+BAX///3AAz////f///9AAAu///////+IAAALf/////9MAAAAAff///XEAAAAAAAJFQgAAAA"],"1":[10,22,1,"i7u7u7bP////+c/////5z/////lFVc//+QAAf//5AAB///kAAH//+QAAf//5AAB///kAAH//+QAAf//5AAB///kAAH//+QAAf//5AAB///kAAH//+QAAf//5AAB///kAAH//+QAAf//5AAB///k="],"2":[18,23,0,"AAAAABAAAAAAAAFq3//qYQAAAF7//////UAACf////////UAj/////////4QTf/8YyS///9wAY9wAAAL//+gAAIAAAAG//+gAAAAAAAH//+QAAAAAAAL//9gAAAAAABv//4QAAAAAAT///cAAAAAAF///6AAAAAABf//+wAAAAAAb///sQAAAAAH///6AAAAAACP//+QAAAAAAn///gAAAAAAJ///5IiIiIhCv/////////3D//////////3D//////////3D//////////3"],"3":[18,23,1,"Cru7u7u7u7swDv////////9ADv////////9ADv////////8wBVVVVVb///YAAAAAAAv//4AAAAAAAJ//+gAAAAAACP//sAAAAAAAb//9EAAAAAAC////lAAAAAAC/////7EAAAAC//////wQAAACqrz///+AAAAAAAAb///gAAAAAAAB///yAAAAAAAA3//zA3AAAAAC///xC/1zAABd///QT///7d////9gv/////////sAXf///////6EAAFrv////tAAAAAACRVUwAAAA"],"4":[22,22,1,"AAAAAAAau7sgAAAAAAAAAL//+QAAAAAAAAAH///RAAAAAAAAAD///zAAAAAAAAAB3//2AAAAAAAAAAr//6AAAAAAAAAAb//9EAAAAAAAAAP///QAAAAAAAAAHf//gAAAAAAAAACv//wAK7u2AAAABv//4gA///gAAAA+//9QAD//+AAAAd//+QAAP//4AAAJ///7qqrf//+qoR/////////////xH/////////////Ef////////////8Qd3d3d3d8///3dxAAAAAAAAX//4AAAAAAAAAABf//gAAAAAAAAAAF//+AAAAAAAAAAAX//4AAA="],"5":[18,23,1,"AAq7u7u7u7swAB////////9AAD////////9AAE////////9AAF//+FVVVVUQAH//8gAAAAAAAI//8QAAAAAAAJ//4AAAAAAAAL//+IdlEAAAAM//////+0AAAN////////kAAP////////+AAIiIiJrf///hAAAAAAAF///2AAAAAAAAr//4AAAAAAAAj//4AIIAAAAAz//3Bv6UEAA6///zDf///t7///+wb/////////4gK////////9MAADjP////xwAAAAABNFVBAAAA"],"6":[19,24,0,"AAAAAAABAAAAAAAAAovv/9phAAAAKv//////4gAAPv///////AAAPv///////0AADf//+kESSbAAB///5AAAAAAAAO//9gAAAAAAAE///QAAAAAAAAf//4AViYYQAACv//aO////ogAL/////////+MAz//////////hC////6Q0n///gK///4AAAG///gj//+EAAADf//Ff//0AAAAM//8R7//xAAAA7//wCf//oAAAn//7AB7//9hnz///UABP////////kAAATv//////gAAAABff///qMAAAAAAAJFUxAAAA"],"7":[19,22,1,"K7u7u7u7u7u7I///////////8z///////////zP///////////I///pmZmb///wD//9AAAAe//9QP//0AAAH///QA+7uQAAA3//3AAAAAAAAX//+EAAAAAAADP//kAAAAAAABP//8gAAAAAAAK//+wAAAAAAAC///0AAAAAAAAj//9AAAAAAAAHv//YAAAAAAAB///4QAAAAAAAN//+AAAAAAAAF///yAAAAAAAAz//6AAAAAAAAP///MAAAAAAACv//wAAAAAAAAv//9QAAAAA="],"8":[19,24,0,"AAAAAAAAAAAAAAACe+/+2UAAAAAI///////DAAAL////////5AAH///+us///+EA3//6EABP//9QH///EAAAn//4Af//4AAAB///gA7//zAAAL//9gCP//1RA6///hABz////////1AAAf///////2AAAs////////9gAd///6h57///UH///SAAAJ///gz//1AAAADf//Pf//MAAAAL//9d//9QAAAA3//0n//9EAAAf///E////pZnz///oAf/////////0QAH7///////sQAAAY3////qQAAAAAACNVQwAAAA"],"9":[19,24,0,"AAAAAAAAAAAAAAABfO/+xxAAAAAG7/////+AAAAI////////sAAF///+u9///5AA3//5EABe//8wP//8AAAAb//6Bf//gAAAAv//8F//+QAAAC///0P//9EAAAj///YN///DABj///9wf////t/////4AK//////////gACP////+6//9wAAJ7zclAv//0AAAAAAAADv//EAAAAAAABv//wAAAAAAAA+//9gAAkwAAF+///AAAX/7Lz////jAADf///////kAABf///////DAAAAbP////tQAAAAAAE1VTEAAAAA"]};
  const BADGE_LAYOUT = {"1":[0.0,18.44],"2":[0.0,18.44],"3":[0.0,17.44],"4":[0.0,18.44],"5":[0.0,18.44],"6":[0.0,18.44],"7":[0.0,18.44],"8":[0.0,18.44],"9":[0.0,18.44],"10":[0.0,18.44,31.02],"11":[0.0,18.44,31.02],"12":[0.0,18.44,31.02],"13":[0.0,18.44,30.02],"14":[0.0,18.44,31.02],"15":[0.0,18.44,31.02],"16":[0.0,18.44,31.02],"17":[0.0,18.44,31.02],"18":[0.0,18.44,31.02],"19":[0.0,18.44,31.02],"20":[0.0,18.44,36.98]};
  // ---- count badges ("x4"): matched against the badge font's own glyphs ----
  // Every count from x1 to x20 is drawn from the glyph bitmaps at the size of the text on the badge and
  // compared with it; the closest wins. Unlike general OCR this never drops the thin "1" of x1 / x12.
  const GLYPH = {};
  for (const [ch, [w, h, top, b64]] of Object.entries(BADGE_GLYPHS)) {
    const raw = atob(b64);
    const a = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { const v = raw.charCodeAt(i >> 1); a[i] = ((i & 1) ? (v & 15) : (v >> 4)) / 15; }
    GLYPH[ch] = { w, h, top, a };
  }
  const glyphAt = (g, u, v) => {
    // bilinear sample of a glyph bitmap (0 outside)
    if (u <= -1 || v <= -1 || u >= g.w || v >= g.h) return 0;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const p = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : g.a[y * g.w + x]);
    return (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx) * fy;
  };
  // returns { count, scores: { n: error } } for the text inside a badge's white box, or null
  function readBadge(canvas, box) {
    const W = canvas.width, H = canvas.height;
    const x0 = Math.max(0, Math.floor(box.x0) + 1), x1 = Math.min(W, Math.ceil(box.x1));
    const y0 = Math.max(0, Math.floor(box.y0)), y1 = Math.min(H, Math.ceil(box.y1) + 1);
    const w = x1 - x0, h = y1 - y0;
    if (w < 8 || h < 8) return null;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
    const ink = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      ink[i] = Math.max(0, Math.min(1, (180 - lum) / 80)); // the brown text; the golden border stays out
    }
    // the text's extent: rows and columns holding ink
    const colSum = new Float32Array(w), rowSum = new Float32Array(h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { colSum[x] += ink[y * w + x]; rowSum[y] += ink[y * w + x]; }
    let xa = -1, xb = -1, ya = -1, yb = -1;
    for (let x = 0; x < w; x++) if (colSum[x] >= 0.8) { if (xa < 0) xa = x; xb = x; }
    for (let y = 0; y < h; y++) if (rowSum[y] >= 0.8) { if (ya < 0) ya = y; yb = y; }
    if (xa < 0 || ya < 0) return null;
    const th = yb - ya + 1, tw = xb - xa + 1;
    if (th < 6 || tw < 6) return null;
    const s = th / 24; // template digits are 24 px tall
    const m = 2;
    const scores = {};
    for (let n = 1; n <= 20; n++) {
      const str = 'x' + n;
      const pos = BADGE_LAYOUT[n];
      const last = GLYPH[str[str.length - 1]];
      const natural = (pos[pos.length - 1] + last.w) * s;
      const fit = Math.max(0.85, Math.min(1.15, tw / natural));
      let best = Infinity;
      for (const sx of [fit * 0.97, fit, fit * 1.03]) {
        for (const dx of [-1, 0, 1]) {
          let err = 0, cnt = 0;
          // compared from just before the first digit: the "x" is the same in every candidate
          const from = Math.max(xa - m, Math.floor(xa + dx + pos[1] * s * sx) - m);
          for (let y = ya - m; y <= yb + m; y++) {
            for (let x = from; x <= xb + m; x++) {
              const o = x >= 0 && y >= 0 && x < w && y < h ? ink[y * w + x] : 0;
              let r = 0;
              for (let i = 0; i < str.length; i++) {
                const g = GLYPH[str[i]];
                const u = (x - xa - dx - pos[i] * s * sx) / (s * sx), v = (y - ya - g.top * s) / s;
                if (u > -1 && u < g.w && v > -1 && v < g.h) { const val = glyphAt(g, u, v); if (val > r) r = val; }
              }
              err += (o - r) * (o - r);
              cnt++;
            }
          }
          const e = err / cnt;
          if (e < best) best = e;
        }
      }
      scores[n] = best + 0.02 * Math.abs(Math.log(tw / natural));
    }
    const order = Object.keys(scores).map(Number).sort((a, b) => scores[a] - scores[b]);
    const [b1, b2] = order;
    return { count: scores[b1] < 0.9 * scores[b2] ? b1 : null, best: b1, scores };
  }

  window.IngIcons = { findRow, score, readCount: readBadge, names: NAMES };
})();
