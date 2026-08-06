package com.stellana.mixing.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * Applies small, idempotent compatibility changes to databases created by
 * earlier prototype versions.
 *
 * <p>Hibernate's {@code ddl-auto=update} adds columns, but it does not reliably
 * relax an existing NOT NULL constraint. This migration keeps an existing H2
 * or PostgreSQL database compatible with the temporary manual Blanking intake
 * workflow.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
@Slf4j
public class LegacySchemaMigration implements ApplicationRunner {

    private static final String TABLE_NAME = "blanking_batches";
    private static final String COLUMN_NAME = "approved_material_batch_id";

    private final DataSource dataSource;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) throws SQLException {
        Boolean nullable = findColumnNullable();
        if (nullable == null) {
            throw new IllegalStateException(
                    "Expected database column " + TABLE_NAME + "." + COLUMN_NAME + " was not found");
        }

        if (!nullable) {
            jdbcTemplate.execute("""
                    ALTER TABLE blanking_batches
                    ALTER COLUMN approved_material_batch_id DROP NOT NULL
                    """);

            if (!Boolean.TRUE.equals(findColumnNullable())) {
                throw new IllegalStateException(
                        "Could not make " + TABLE_NAME + "." + COLUMN_NAME + " nullable");
            }

            log.info("Updated legacy schema: {}.{} now permits manual Blanking intake",
                    TABLE_NAME, COLUMN_NAME);
        }
    }

    private Boolean findColumnNullable() throws SQLException {
        try (Connection connection = dataSource.getConnection();
             ResultSet columns = connection.getMetaData().getColumns(
                     connection.getCatalog(), null, "%", "%")) {
            while (columns.next()) {
                if (TABLE_NAME.equalsIgnoreCase(columns.getString("TABLE_NAME"))
                        && COLUMN_NAME.equalsIgnoreCase(columns.getString("COLUMN_NAME"))) {
                    return columns.getInt("NULLABLE") != DatabaseMetaData.columnNoNulls;
                }
            }
        }
        return null;
    }
}
