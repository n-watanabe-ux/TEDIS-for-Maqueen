/**
 * TEDIS for Maqueen - basic movement blocks
 * Target: DFRobot Maqueen Plus V3 using the official maqueenPlusV2 extension.
 *
 * This first implementation includes timed and continuous Tank/Steering movement.
 * Encoder-count movement is intentionally not included until a reliable public API
 * for per-wheel cumulative encoder counts is confirmed.
 */
//% color="#4C8C6B" icon="\uf1b9" block="移動"
namespace tedisMove {
    let initialized = false

    /** Ensure the official Maqueen Plus extension has initialized its I2C controller. */
    function ensureInitialized(): void {
        if (!initialized) {
            maqueenPlusV2.I2CInit()
            initialized = true
        }
    }

    /** Convert TEDIS speed 0..100 to the Maqueen motor range.
     * 0 means stop; 1..100 maps linearly to 40..255.
     */
    function motorSpeed(percent: number): number {
        percent = Math.max(0, Math.min(100, percent))
        if (percent <= 0) return 0
        return Math.round(40 + percent * 215 / 100)
    }

    /** Send a signed percentage to one motor. Positive = forward, negative = backward. */
    function setMotor(motor: maqueenPlusV2.MyEnumMotor, signedPercent: number): void {
        const magnitude = Math.max(-100, Math.min(100, signedPercent))
        if (Math.abs(magnitude) < 0.5) {
            maqueenPlusV2.controlMotorStop(motor)
            return
        }

        const direction = magnitude >= 0
            ? maqueenPlusV2.MyEnumDir.Forward
            : maqueenPlusV2.MyEnumDir.Backward
        maqueenPlusV2.controlMotor(
            motor,
            direction,
            motorSpeed(Math.abs(magnitude))
        )
    }

    /** Start Tank movement with independent left/right forward speed percentages. */
    function startTank(leftSpeed: number, rightSpeed: number): void {
        ensureInitialized()
        setMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, leftSpeed)
        setMotor(maqueenPlusV2.MyEnumMotor.RightMotor, rightSpeed)
    }

    /** Start Steering movement. Steering -100..100; signed speed -100..100. */
    function startSteering(steering: number, speed: number): void {
        steering = Math.max(-100, Math.min(100, steering))
        speed = Math.max(-100, Math.min(100, speed))

        let left = speed
        let right = speed
        if (steering >= 0) {
            right = speed * (1 - 2 * steering / 100)
        } else {
            left = speed * (1 + 2 * steering / 100)
        }

        ensureInitialized()
        setMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, left)
        setMotor(maqueenPlusV2.MyEnumMotor.RightMotor, right)
    }

    /** Stop both motors using the official extension's stop command. */
    //% block="移動をやめる"
    //% group="停止"
    //% weight=1
    export function stop(): void {
        ensureInitialized()
        maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
    }

    /** Tank drive for a specified number of seconds. */
    //% block="移動 左 %leftSpeed 右 %rightSpeed の速度で %seconds 秒"
    //% leftSpeed.min=0 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=0 rightSpeed.max=100 rightSpeed.defl=50
    //% seconds.min=0 seconds.max=60 seconds.defl=1
    //% group="タンク"
    //% weight=20
    export function tankForSeconds(leftSpeed: number, rightSpeed: number, seconds: number): void {
        startTank(leftSpeed, rightSpeed)
        basic.pause(Math.max(0, seconds) * 1000)
        stop()
    }

    /** Tank drive continuously until the stop block is called. */
    //% block="移動 左 %leftSpeed 右 %rightSpeed の速度で連続"
    //% leftSpeed.min=0 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=0 rightSpeed.max=100 rightSpeed.defl=50
    //% group="タンク"
    //% weight=19
    export function tankOn(leftSpeed: number, rightSpeed: number): void {
        startTank(leftSpeed, rightSpeed)
    }

    /** Steering drive for a specified number of seconds. */
    //% block="移動 向き %steering 速度 %speed で %seconds 秒"
    //% steering.min=-100 steering.max=100 steering.defl=0
    //% speed.min=-100 speed.max=100 speed.defl=50
    //% seconds.min=0 seconds.max=60 seconds.defl=1
    //% group="ステアリング"
    //% weight=18
    export function steeringForSeconds(steering: number, speed: number, seconds: number): void {
        startSteering(steering, speed)
        basic.pause(Math.max(0, seconds) * 1000)
        stop()
    }

    /** Steering drive continuously until the stop block is called. */
    //% block="移動 向き %steering 速度 %speed で連続"
    //% steering.min=-100 steering.max=100 steering.defl=0
    //% speed.min=-100 speed.max=100 speed.defl=50
    //% group="ステアリング"
    //% weight=17
    export function steeringOn(steering: number, speed: number): void {
        startSteering(steering, speed)
    }
}

