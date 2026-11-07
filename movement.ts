/**
 * TEDIS for Maqueen - basic movement blocks
 * Target: DFRobot Maqueen Plus V3 using the official maqueenPlusV2 extension.
 *
 * Timed and continuous Tank/Steering movement.
 * Angle mode estimates wheel rotation by integrating the absolute per-wheel
 * linear-speed readings reported by the Maqueen controller.
 * Wheel diameter is assumed to be 43 mm.
 *
 * Added:
 * - Automatic left/right motor speed correction.
 * - Shared correction logic for Tank and Steering.
 * - Background feedback loop for continuous and timed movements.
 */
//% color="#4C8C6B" icon="\uf1b9" block="TEDIS移動"
namespace tedisMove {
    let initialized = false

    // Speed correction settings
    let correctionEnabled = true
    let correctionStrength = 0.5
    const maxCorrection = 0.15
    const correctionInterval = 100

    // Current movement command
    let movementActive = false
    let baseLeftSpeed = 0
    let baseRightSpeed = 0

    // Background correction loop
    let correctionLoopStarted = false

    // Filtered speed readings
    let filteredLeftSpeed = 0
    let filteredRightSpeed = 0
    let speedFilterReady = false

    /** Select whether a timed movement is specified in seconds or wheel rotation angle. */
    export enum MoveUnit {
        //% block="秒"
        Seconds,
        //% block="度"
        Angle
    }

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

    /** Set motor using an already calculated PWM value. */
    function setMotorPwm(
        motor: maqueenPlusV2.MyEnumMotor,
        signedPercent: number,
        pwm: number
    ): void {
        if (Math.abs(signedPercent) < 0.5) {
            maqueenPlusV2.controlMotorStop(motor)
            return
        }

        const direction = signedPercent >= 0
            ? maqueenPlusV2.MyEnumDir.Forward
            : maqueenPlusV2.MyEnumDir.Backward

        const output = Math.max(40, Math.min(255, Math.round(pwm)))

        maqueenPlusV2.controlMotor(motor, direction, output)
    }

    /** Send a signed percentage to one motor. */
    function setMotor(
        motor: maqueenPlusV2.MyEnumMotor,
        signedPercent: number
    ): void {
        const magnitude = Math.max(-100, Math.min(100, signedPercent))

        if (Math.abs(magnitude) < 0.5) {
            maqueenPlusV2.controlMotorStop(motor)
            return
        }

        setMotorPwm(
            motor,
            magnitude,
            motorSpeed(Math.abs(magnitude))
        )
    }

    /** Apply output with a correction factor. */
    function applyMotorOutputs(correction: number): void {
        const leftPwm = motorSpeed(Math.abs(baseLeftSpeed))
        const rightPwm = motorSpeed(Math.abs(baseRightSpeed))

        setMotorPwm(
            maqueenPlusV2.MyEnumMotor.LeftMotor,
            baseLeftSpeed,
            leftPwm * (1 - correction)
        )

        setMotorPwm(
            maqueenPlusV2.MyEnumMotor.RightMotor,
            baseRightSpeed,
            rightPwm * (1 + correction)
        )
    }

    /** Update correction using normalized left/right motor response. */
    function updateSpeedCorrection(): void {
        if (!movementActive || !correctionEnabled) return

        const leftPwm = motorSpeed(Math.abs(baseLeftSpeed))
        const rightPwm = motorSpeed(Math.abs(baseRightSpeed))

        // Correction requires both motors to be moving.
        // Do not correct pivot turns or one-sided movement.
        if (leftPwm <= 0 || rightPwm <= 0) return

        const leftSpeed = Math.abs(
            maqueenPlusV2.readRealTimeSpeed(
                maqueenPlusV2.DirectionType2.Left
            )
        )

        const rightSpeed = Math.abs(
            maqueenPlusV2.readRealTimeSpeed(
                maqueenPlusV2.DirectionType2.Right
            )
        )

        // Ignore startup and very low-speed readings.
        if (leftSpeed < 0.1 || rightSpeed < 0.1) return

        // Low-pass filter to reduce speed reading fluctuations.
        if (!speedFilterReady) {
            filteredLeftSpeed = leftSpeed
            filteredRightSpeed = rightSpeed
            speedFilterReady = true
        } else {
            filteredLeftSpeed =
                filteredLeftSpeed * 0.7 + leftSpeed * 0.3

            filteredRightSpeed =
                filteredRightSpeed * 0.7 + rightSpeed * 0.3
        }

        // Compare actual speed per unit of commanded PWM.
        const leftGain = filteredLeftSpeed / leftPwm
        const rightGain = filteredRightSpeed / rightPwm

        const totalGain = leftGain + rightGain

        if (totalGain <= 0) return

        // Positive correction means left motor is relatively faster.
        let correction =
            correctionStrength *
            (leftGain - rightGain) / totalGain

        // Limit correction to prevent excessive output changes.
        correction = Math.max(
            -maxCorrection,
            Math.min(maxCorrection, correction)
        )

        applyMotorOutputs(correction)
    }

    /** Start the shared background correction loop. */
    function startCorrectionLoop(): void {
        if (correctionLoopStarted) return

        correctionLoopStarted = true

        control.inBackground(function () {
            while (true) {
                basic.pause(correctionInterval)

                if (movementActive && correctionEnabled) {
                    updateSpeedCorrection()
                }
            }
        })
    }

    /** Start a new movement command. */
    function beginMovement(leftSpeed: number, rightSpeed: number): void {
        ensureInitialized()

        baseLeftSpeed = Math.max(-100, Math.min(100, leftSpeed))
        baseRightSpeed = Math.max(-100, Math.min(100, rightSpeed))

        filteredLeftSpeed = 0
        filteredRightSpeed = 0
        speedFilterReady = false

        movementActive = true

        // Apply the initial uncorrected command.
        applyMotorOutputs(0)

        startCorrectionLoop()
    }

    /** Start Tank movement with independent left/right signed speed percentages. */
    function startTank(leftSpeed: number, rightSpeed: number): void {
        beginMovement(leftSpeed, rightSpeed)
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

        beginMovement(left, right)
    }

    /**
     * Run until the wheel that travels farthest reaches the requested rotation angle.
     */
    function runForWheelAngle(angle: number): void {
        const wheelDiameterCm = 4.3
        const targetDistanceCm =
            Math.PI * wheelDiameterCm * Math.max(0, angle) / 360

        let leftDistance = 0
        let rightDistance = 0
        let previousTime = input.runningTime()
        let lastMotionTime = previousTime

        while (Math.max(leftDistance, rightDistance) < targetDistanceCm) {
            basic.pause(20)

            const now = input.runningTime()
            const elapsedSeconds =
                Math.max(0, now - previousTime) / 1000

            previousTime = now

            const leftSpeed = Math.abs(
                maqueenPlusV2.readRealTimeSpeed(
                    maqueenPlusV2.DirectionType2.Left
                )
            )

            const rightSpeed = Math.abs(
                maqueenPlusV2.readRealTimeSpeed(
                    maqueenPlusV2.DirectionType2.Right
                )
            )

            leftDistance += leftSpeed * elapsedSeconds
            rightDistance += rightSpeed * elapsedSeconds

            if (leftSpeed > 0 || rightSpeed > 0) {
                lastMotionTime = now
            } else if (now - lastMotionTime > 2000) {
                break
            }
        }

        stop()
    }

    /** Run for either the specified time or the wheel rotation angle. */
    function runForUnit(unit: MoveUnit, amount: number): void {
        if (unit == MoveUnit.Seconds) {
            basic.pause(Math.max(0, amount) * 1000)
            stop()
        } else {
            runForWheelAngle(amount)
        }
    }

    /** Stop both motors using the official extension's stop command. */
    //% block="移動を停止"
    //% group="停止"
    //% weight=1
    export function stop(): void {
        movementActive = false
        ensureInitialized()

        maqueenPlusV2.controlMotorStop(
            maqueenPlusV2.MyEnumMotor.AllMotor
        )
    }

    /** Enable speed correction. */
    //% block="左右モーター速度補正を ON"
    //% group="速度補正"
    //% weight=30
    export function enableSpeedCorrection(): void {
        correctionEnabled = true
    }

    /** Disable speed correction and restore the original output. */
    //% block="左右モーター速度補正を OFF"
    //% group="速度補正"
    //% weight=29
    export function disableSpeedCorrection(): void {
        correctionEnabled = false

        if (movementActive) {
            applyMotorOutputs(0)
        }
    }

    /** Set speed correction strength from 0 to 100. */
    //% block="速度補正の強さ %strength"
    //% strength.min=0 strength.max=100 strength.defl=50
    //% group="速度補正"
    //% weight=28
    export function setSpeedCorrectionStrength(strength: number): void {
        correctionStrength =
            Math.max(0, Math.min(100, strength)) / 100
    }

    /** Tank drive for a specified number of seconds or wheel rotation angle. */
    //% block="移動 左 %leftSpeed 右 %rightSpeed の速度で %amount %unit"
    //% inlineInputMode=inline
    //% leftSpeed.min=-100 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=-100 rightSpeed.max=100 rightSpeed.defl=50
    //% amount.min=0 amount.max=3600 amount.defl=1
    //% unit.defl=0
    //% group="タンク"
    //% weight=20
    export function tankForSeconds(
        leftSpeed: number,
        rightSpeed: number,
        amount: number,
        unit: MoveUnit
    ): void {
        startTank(leftSpeed, rightSpeed)
        runForUnit(unit, amount)
    }

    /** Tank drive continuously until the stop block is called. */
    //% block="移動 左 %leftSpeed 右 %rightSpeed の速度で連続"
    //% leftSpeed.min=-100 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=-100 rightSpeed.max=100 rightSpeed.defl=50
    //% group="タンク"
    //% weight=19
    export function tankOn(leftSpeed: number, rightSpeed: number): void {
        startTank(leftSpeed, rightSpeed)
    }

    /** Steering drive for a specified number of seconds or wheel rotation angle. */
    //% block="移動 方向 %steering 速度 %speed で %amount %unit"
    //% inlineInputMode=inline
    //% steering.min=-100 steering.max=100 steering.defl=0
    //% speed.min=-100 speed.max=100 speed.defl=50
    //% amount.min=0 amount.max=3600 amount.defl=1
    //% unit.defl=0
    //% group="ステアリング"
    //% weight=18
    export function steeringForSeconds(
        steering: number,
        speed: number,
        amount: number,
        unit: MoveUnit
    ): void {
        startSteering(steering, speed)
        runForUnit(unit, amount)
    }

    /** Steering drive continuously until the stop block is called. */
    //% block="移動 方向 %steering 速度 %speed で連続"
    //% steering.min=-100 steering.max=100 steering.defl=0
    //% speed.min=-100 speed.max=100 speed.defl=50
    //% group="ステアリング"
    //% weight=17
    export function steeringOn(
        steering: number,
        speed: number
    ): void {
        startSteering(steering, speed)
    }
}
