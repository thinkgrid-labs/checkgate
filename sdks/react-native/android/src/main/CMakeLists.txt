cmake_minimum_required(VERSION 3.18.1)

project(Checkgate)

set(PACKAGE_NAME "checkgate")
set(NODE_MODULES_DIR "../../node_modules")

# Find JSI headers
find_package(ReactAndroid REQUIRED)

add_library(
    ${PACKAGE_NAME}
    SHARED
    ../../../cpp/checkgate_jsi.cpp
)

target_include_directories(
    ${PACKAGE_NAME}
    PUBLIC
    ../../../cpp
)

target_link_libraries(
    ${PACKAGE_NAME}
    ReactAndroid::jsi
    log
)
