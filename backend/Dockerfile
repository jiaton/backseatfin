FROM denoland/deno:bin AS deno

FROM python:3.12-slim

# ffmpeg: yt-dlp merges video+audio with it, and the stream domain transcodes with it.
# fonts-noto-cjk: libass burns text subtitles into the picture and needs glyphs for
# them — without a CJK font, Chinese/Japanese/Korean subtitles render as nothing.
# deno: yt-dlp needs a JS runtime to solve YouTube's player challenges.
#
# HDR / Dolby Vision streams only (everything else, and yt-dlp, keep Debian's ffmpeg):
# jellyfin-ffmpeg8 (own prefix /usr/lib/jellyfin-ffmpeg, bundles the Intel VAAPI
# driver) tone-maps them to SDR — Debian's ffmpeg can't apply Dolby Vision profile 5's
# reshaping — and Intel's OpenCL runtime lets it do that on an Intel GPU. Debian
# trixie doesn't package the Intel runtime, so it comes from Intel's GitHub releases,
# the same versions Jellyfin's own image ships, pinned by checksum.
ADD --chmod=644 https://repo.jellyfin.org/jellyfin_team.gpg.key /etc/apt/keyrings/jellyfin.asc
ADD --checksum=sha256:ebd795e9fddf303a9b24b7f04545d8ddd9ad1f85b3d0cb1166476fab24da6d44 \
    https://github.com/intel/intel-graphics-compiler/releases/download/v2.40.13/intel-igc-core-2_2.40.13%2B22418_amd64.deb /tmp/intel/igc-core.deb
ADD --checksum=sha256:4f990874efc11c3f6091a663b08aef576c4af592dcd8f12e116f8c2fc92d34d9 \
    https://github.com/intel/intel-graphics-compiler/releases/download/v2.40.13/intel-igc-opencl-2_2.40.13%2B22418_amd64.deb /tmp/intel/igc-opencl.deb
ADD --checksum=sha256:5a9c9e8fdca8a2f9e22754b1a4618c7babf21d7c3ab3503c680005007c7a8c44 \
    https://github.com/intel/compute-runtime/releases/download/26.31.39395.13/intel-opencl-icd_26.31.39395.13-0_amd64.deb /tmp/intel/opencl-icd.deb
ADD --checksum=sha256:6031a63d6e8a12ce61c14efc15f2c8e727061286e3820b8594e6d00615e04d54 \
    https://github.com/intel/compute-runtime/releases/download/26.31.39395.13/libigdgmm12_22.10.0_amd64.deb /tmp/intel/igdgmm.deb
RUN printf 'Types: deb\nURIs: https://repo.jellyfin.org/debian\nSuites: trixie\nComponents: main\nArchitectures: amd64\nSigned-By: /etc/apt/keyrings/jellyfin.asc\n' \
        > /etc/apt/sources.list.d/jellyfin.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk jellyfin-ffmpeg8 /tmp/intel/*.deb \
    && rm -rf /var/lib/apt/lists/* /tmp/intel
COPY --from=deno /deno /usr/local/bin/deno

WORKDIR /app

RUN pip install --no-cache-dir poetry==2.4.1

COPY pyproject.toml poetry.lock ./
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --no-root

COPY . .

# The entrypoint drops to PUID:PGID (default 1000:1000) — set them to the user Emby runs
# as, so downloaded files in the shared library folder are ones Emby can also rename/delete.
RUN mkdir -p /app/data

# Intel's OpenCL compiles the tone-mapping kernels on first use (~4 s per stream start);
# caching them on the data volume makes that a one-off.
ENV NEO_CACHE_PERSISTENT=1 NEO_CACHE_DIR=/app/data/gpu-kernel-cache

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
