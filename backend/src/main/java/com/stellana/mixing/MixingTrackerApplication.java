package com.stellana.mixing;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@EnableJpaAuditing
public class MixingTrackerApplication {
    public static void main(String[] args) {
        SpringApplication.run(MixingTrackerApplication.class, args);
    }
}
