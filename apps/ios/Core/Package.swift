// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "OpenMasjidCore",
    platforms: [.iOS(.v17)],
    products: [.library(name: "OpenMasjidCore", targets: ["OpenMasjidCore"])],
    targets: [
        .target(name: "OpenMasjidCore"),
        .testTarget(name: "OpenMasjidCoreTests", dependencies: ["OpenMasjidCore"])
    ]
)
