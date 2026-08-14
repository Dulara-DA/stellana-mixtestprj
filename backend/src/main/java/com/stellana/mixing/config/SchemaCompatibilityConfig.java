package com.stellana.mixing.config;

import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class SchemaCompatibilityConfig {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    ApplicationRunner allowPressAllocationAtMouldingReceipt(JdbcTemplate jdbcTemplate) {
        return args -> {
            jdbcTemplate.execute(
                    "ALTER TABLE blanking_carts ALTER COLUMN destination_press_id DROP NOT NULL");
            jdbcTemplate.execute(
                    "ALTER TABLE cart_transfers ALTER COLUMN destination_press_id DROP NOT NULL");
            jdbcTemplate.update(
                    "UPDATE blank_returns SET return_type = 'UNUSED_GOOD_BLANKS' WHERE return_type IS NULL");
        };
    }
}
