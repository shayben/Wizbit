/**
 * Azure Functions v4 programming model entry point.
 * Importing each function file registers it with the host.
 */

import './functions/ocr.js';
import './functions/openaiChat.js';
import './functions/openaiImage.js';
import './functions/speechToken.js';
import './functions/translate.js';
import './functions/usage.js';
import './functions/health.js';
import './functions/waitlist.js';
