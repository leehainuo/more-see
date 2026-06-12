from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "More See"
    app_env: str = "development"
    app_debug: bool = True
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    asr_provider: str = "mock"
    vision_provider: str = "mock"
    llm_provider: str = "mock"
    tts_provider: str = "mock"
    volcengine_tts_app_id: str = ""
    volcengine_tts_access_token: str = ""
    volcengine_tts_resource_id: str = "seed-tts-2.0"
    volcengine_tts_speaker: str = "zh_female_shuangkuaisisi_moon_bigtts"
    volcengine_tts_format: str = "mp3"
    volcengine_tts_sample_rate: int = 24000
    ark_api_key: str = ""
    ark_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    ark_llm_model: str = "doubao-seed-1-6-251015"
    ark_vision_model: str = "doubao-seed-1-6-vision-250815"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
