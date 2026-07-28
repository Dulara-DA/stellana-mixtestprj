package com.stellana.mixing.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import java.time.ZoneId;
import java.util.TimeZone;

@Configuration
public class FactoryTimeZoneConfig {
    private final String timeZone;

    public FactoryTimeZoneConfig(@Value("${app.time-zone:Asia/Colombo}") String timeZone) {
        this.timeZone = timeZone;
    }

    @PostConstruct
    void configureFactoryTimeZone() {
        TimeZone.setDefault(TimeZone.getTimeZone(ZoneId.of(timeZone)));
    }
}
