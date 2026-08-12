import type { CoworkMediaSelection } from './types';

export const buildMediaGenerationTurnInstruction = (
  selection?: CoworkMediaSelection,
  hasMediaSkillActive?: boolean,
): string => {
  if (!selection || selection.mode === 'none') {
    if (hasMediaSkillActive) {
      return [
        '[LogicNest WorkHub media generation tools - NOT AVAILABLE]',
        'The configured media generation tools are NOT available for this turn.',
        'Do NOT call lobsterai_image_generate or lobsterai_video_generate.',
        'However, a media generation skill (e.g. seedream, seedance) is provided in the system prompt. You may use it to fulfill image or video generation requests.',
      ].join('\n');
    }
    return '';
  }

  const lines = [
    '[LogicNest WorkHub media generation turn instruction]',
    'The user selected a LogicNest WorkHub media generation model for this turn.',
    'IMPORTANT: Do NOT read or use the "seedance" or "seedream" skills for this request.',
    'The configured media generation tools (lobsterai_image_generate / lobsterai_video_generate) replace those skills when a media model is selected.',
    'Do not run any skill scripts for image or video generation. Use only the lobsterai_* tools specified below.',
  ];

  if (selection.mode === 'image') {
    lines.push('If the current user request asks to create, generate, draw, render, or make an image/photo/picture, you must call the lobsterai_image_generate tool exactly once with action="generate".');
    lines.push('Use the current user request and relevant prior conversation as the image prompt.');
    lines.push('Do not answer with only a text prompt when the user asked for an image.');
    const imageModel = selection.imageModelId?.trim() || selection.modelId?.trim();
    if (imageModel) {
      lines.push(`You MUST use model "${imageModel}" for image generation. Do NOT use any other model for the generate action, even if other models appear in the available model list.`);
    }
  } else if (selection.mode === 'video') {
    lines.push('If the current user request asks to create, generate, render, or make a video, you must call the lobsterai_video_generate tool exactly once with action="generate".');
    lines.push('Use the current user request and relevant prior conversation as the video prompt.');
    lines.push('Do not answer with only a text prompt when the user asked for a video.');
    const videoModel = selection.videoModelId?.trim() || selection.modelId?.trim();
    if (videoModel) {
      lines.push(`You MUST use model "${videoModel}" for video generation. Do NOT use any other model for the generate action, even if other models appear in the available model list.`);
    }
  } else {
    lines.push('If the current user request asks for image generation, call lobsterai_image_generate with action="generate".');
    lines.push('If the current user request asks for video generation, call lobsterai_video_generate with action="generate".');
    lines.push('Use the current user request and relevant prior conversation as the media prompt.');
    if (selection.imageModelId?.trim()) {
      lines.push(`For image generation, you MUST use model "${selection.imageModelId.trim()}". Do NOT use a different model.`);
    }
    if (selection.videoModelId?.trim()) {
      lines.push(`For video generation, you MUST use model "${selection.videoModelId.trim()}". Do NOT use a different model.`);
    }
  }

  if (!selection.imageModelId && !selection.videoModelId && selection.modelId?.trim()) {
      lines.push(`You MUST use model "${selection.modelId.trim()}" for media generation. Do NOT use a different model unless the user explicitly requests a different LogicNest WorkHub media model by name.`);
  }

  return lines.join('\n');
};
