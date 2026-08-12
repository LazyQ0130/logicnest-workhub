import argparse
import sys

from faster_whisper import WhisperModel
from opencc import OpenCC


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--audio', required=True)
    args = parser.parse_args()

    model = WhisperModel(
        args.model,
        device='cpu',
        compute_type='int8',
        cpu_threads=4,
        num_workers=1,
    )
    segments, _ = model.transcribe(
        args.audio,
        language='zh',
        task='transcribe',
        beam_size=5,
        best_of=5,
        temperature=0.0,
        vad_filter=True,
        vad_parameters={'min_silence_duration_ms': 450},
        condition_on_previous_text=False,
    )
    text = ''.join(segment.text.strip() for segment in segments).strip()
    # Whisper may emit traditional characters for the same Mandarin audio;
    # the desktop product consistently presents simplified Chinese.
    text = OpenCC('t2s').convert(text)
    sys.stdout.write(text)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
